import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { decorateSponsor } from "../../../../lib/sponsors";

// ── Nested select used everywhere we return announcements ────────────
const ANNOUNCEMENT_SELECT = `
  id, title, content, is_published, announcement_type, award_id,
  event_starts_at, event_ends_at, event_location_name, event_address,
  event_registration_url,
  created_at, updated_at,
  award:awards ( id, name, description, prize,
    award_sponsors ( sort_order,
      sponsor:sponsors ( id, name, website, logo_path )
    )
  ),
  announcement_winners ( sort_order,
    pitch:pitches ( id, name, role, schools, title, description,
                    file_type, file_name, mux_playback_id, thumbnail_path )
  ),
  announcement_sponsors ( sort_order,
    sponsor:sponsors ( id, name, website, logo_path )
  )
`;

// Reshape the raw row into the client-friendly payload used by both
// admin and public consumers: sponsors are decorated with logo_url,
// winners come back as a plain ordered array, and event sponsors are
// flattened alongside.
function decorateAnnouncement(row) {
  if (!row) return row;
  const award = row.award
    ? (() => {
        const joins = (row.award.award_sponsors || [])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const sponsors = joins
          .map((j) => (j.sponsor ? decorateSponsor(j.sponsor) : null))
          .filter(Boolean);
        const { award_sponsors, ...rest } = row.award;
        return { ...rest, sponsors };
      })()
    : null;

  const winners = (row.announcement_winners || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((w) => w.pitch)
    .filter(Boolean);

  const sponsors = (row.announcement_sponsors || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((j) => (j.sponsor ? decorateSponsor(j.sponsor) : null))
    .filter(Boolean);

  const {
    award: _a,
    announcement_winners: _w,
    announcement_sponsors: _s,
    ...rest
  } = row;
  return { ...rest, award, winners, sponsors };
}

async function replaceWinners(supabaseAdmin, announcementId, pitchIds) {
  await supabaseAdmin
    .from("announcement_winners")
    .delete()
    .eq("announcement_id", announcementId);
  if (!pitchIds?.length) return;
  const rows = pitchIds.map((pitchId, i) => ({
    announcement_id: announcementId,
    pitch_id: pitchId,
    sort_order: i,
  }));
  const { error } = await supabaseAdmin.from("announcement_winners").insert(rows);
  if (error) throw new Error(error.message);
}

async function replaceAnnouncementSponsors(supabaseAdmin, announcementId, sponsorIds) {
  await supabaseAdmin
    .from("announcement_sponsors")
    .delete()
    .eq("announcement_id", announcementId);
  if (!sponsorIds?.length) return;
  const rows = sponsorIds.map((sponsorId, i) => ({
    announcement_id: announcementId,
    sponsor_id: sponsorId,
    sort_order: i,
  }));
  const { error } = await supabaseAdmin.from("announcement_sponsors").insert(rows);
  if (error) throw new Error(error.message);
}

async function fetchAnnouncement(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return decorateAnnouncement(data);
}

function coerceType(raw) {
  const t = String(raw || "general").toLowerCase();
  return ["general", "award", "event"].includes(t) ? t : "general";
}

// Normalize an incoming datetime string. Accepts null / "" / ISO.
function coerceTimestamp(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(decorateAnnouncement));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const isPublished = body.is_published === undefined ? true : Boolean(body.is_published);
    const announcementType = coerceType(body.announcement_type);
    const awardId = body.award_id ? String(body.award_id) : null;
    const winnerPitchIds = Array.isArray(body.winner_pitch_ids)
      ? body.winner_pitch_ids.filter((s) => typeof s === "string")
      : [];
    const sponsorIds = Array.isArray(body.sponsor_ids)
      ? body.sponsor_ids.filter((s) => typeof s === "string")
      : [];

    // Event fields (only used when type === 'event').
    const eventStartsAt = coerceTimestamp(body.event_starts_at);
    const eventEndsAt = coerceTimestamp(body.event_ends_at);
    const eventLocationName = body.event_location_name ? String(body.event_location_name).trim() : null;
    const eventAddress = body.event_address ? String(body.event_address).trim() : null;
    const eventRegistrationUrl = body.event_registration_url ? String(body.event_registration_url).trim() : null;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    if (announcementType === "award") {
      if (!awardId) {
        return NextResponse.json({ error: "award_id is required for award announcements" }, { status: 400 });
      }
      if (winnerPitchIds.length === 0) {
        return NextResponse.json({ error: "At least one winner pitch is required" }, { status: 400 });
      }
    }
    if (announcementType === "event") {
      if (!eventStartsAt) {
        return NextResponse.json({ error: "Event start time is required" }, { status: 400 });
      }
      if (!eventAddress) {
        return NextResponse.json({ error: "Event address is required (for the map)" }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const supabaseAdmin = getSupabaseAdmin();

    const insertRow = {
      title,
      content,
      is_published: isPublished,
      announcement_type: announcementType,
      award_id: announcementType === "award" ? awardId : null,
      event_starts_at: announcementType === "event" ? eventStartsAt : null,
      event_ends_at: announcementType === "event" ? eventEndsAt : null,
      event_location_name: announcementType === "event" ? eventLocationName : null,
      event_address: announcementType === "event" ? eventAddress : null,
      event_registration_url: announcementType === "event" ? eventRegistrationUrl : null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from("announcements")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (announcementType === "award") {
      await replaceWinners(supabaseAdmin, data.id, winnerPitchIds);
    }
    // Sponsors currently apply only to event announcements. Award announcements
    // inherit sponsors from their linked award.
    if (announcementType === "event") {
      await replaceAnnouncementSponsors(supabaseAdmin, data.id, sponsorIds);
    }

    const full = await fetchAnnouncement(supabaseAdmin, data.id);
    return NextResponse.json(full);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const patch = { updated_at: new Date().toISOString() };
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.content === "string") {
      const c = body.content.trim();
      if (!c) return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
      patch.content = c;
    }
    if (body.is_published !== undefined) {
      patch.is_published = Boolean(body.is_published);
    }
    if (body.announcement_type !== undefined) {
      patch.announcement_type = coerceType(body.announcement_type);
    }
    if (body.award_id !== undefined) {
      patch.award_id = body.award_id || null;
    }
    if (body.event_starts_at !== undefined) patch.event_starts_at = coerceTimestamp(body.event_starts_at);
    if (body.event_ends_at !== undefined) patch.event_ends_at = coerceTimestamp(body.event_ends_at);
    if (body.event_location_name !== undefined) {
      patch.event_location_name = body.event_location_name ? String(body.event_location_name).trim() : null;
    }
    if (body.event_address !== undefined) {
      patch.event_address = body.event_address ? String(body.event_address).trim() : null;
    }
    if (body.event_registration_url !== undefined) {
      patch.event_registration_url = body.event_registration_url ? String(body.event_registration_url).trim() : null;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("announcements")
      .update(patch)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (Array.isArray(body.winner_pitch_ids)) {
      const winnerPitchIds = body.winner_pitch_ids.filter((s) => typeof s === "string");
      await replaceWinners(supabaseAdmin, id, winnerPitchIds);
    }
    if (Array.isArray(body.sponsor_ids)) {
      const sponsorIds = body.sponsor_ids.filter((s) => typeof s === "string");
      await replaceAnnouncementSponsors(supabaseAdmin, id, sponsorIds);
    }

    const full = await fetchAnnouncement(supabaseAdmin, id);
    return NextResponse.json(full);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("announcements").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
