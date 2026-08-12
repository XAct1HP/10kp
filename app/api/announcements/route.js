import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase";
import { decorateSponsor } from "../../../lib/sponsors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ANNOUNCEMENT_SELECT = `
  id, title, content, announcement_type, award_id,
  event_starts_at, event_ends_at, event_location_name, event_address,
  event_registration_url,
  created_at, updated_at,
  award:awards ( id, name, description, prize,
    award_sponsors ( sort_order,
      sponsor:sponsors ( id, name, website, logo_path )
    )
  ),
  announcement_winners ( sort_order,
    pitch:pitches ( id, name, role, schools, title,
                    file_type, file_name, mux_playback_id, thumbnail_path,
                    moderation_status )
  ),
  announcement_sponsors ( sort_order,
    sponsor:sponsors ( id, name, website, logo_path )
  )
`;

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

  // Only show winners whose pitches are approved (or moderation not tracked).
  const winners = (row.announcement_winners || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((w) => w.pitch)
    .filter((p) => p && (p.moderation_status === "approved" || !p.moderation_status));

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

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .eq("is_published", true)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(decorateAnnouncement), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
