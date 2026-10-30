import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ANNOUNCEMENT_SELECT = `
  id, title, created_at, updated_at, award_id,
  award:awards ( id, name, description, prize, sort_order ),
  announcement_winners ( sort_order,
    pitch:pitches (
      id, name, title, file_type, file_name,
      thumbnail_path, mux_playback_id, moderation_status, is_seed
    )
  )
`;

function competitionYearFromSettings(competitionDate) {
  if (competitionDate) {
    const y = new Date(competitionDate).getFullYear();
    if (Number.isFinite(y)) return y;
  }
  return new Date().getFullYear();
}

function isMissingRelationError(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST204" ||
    /does not exist|schema cache|could not find/i.test(error?.message || "")
  );
}

function thumbDefaults(settings) {
  return {
    audioThumbnail: settings?.default_audio_thumbnail || null,
    textThumbnail: settings?.default_text_thumbnail || null,
  };
}

// Hall of Fame = winners announced for this competition year via published
// award announcements (Record Winners flow). Seed / archive pitches with a
// matching winner_year are included as a fallback for years that were
// archived without announcements.
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: settings } = await supabaseAdmin
      .from("competition_settings")
      .select(
        "competition_date, default_audio_thumbnail, default_text_thumbnail"
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const year = competitionYearFromSettings(settings?.competition_date);
    const defaults = thumbDefaults(settings);
    const winnersByKey = new Map();

    // ── Primary: published award announcements ──
    const { data: announcements, error: annErr } = await supabaseAdmin
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .eq("is_published", true)
      .eq("announcement_type", "award")
      .order("updated_at", { ascending: false });

    if (annErr && !isMissingRelationError(annErr)) {
      return NextResponse.json({ error: annErr.message }, { status: 500 });
    }

    // Published award announcements are the live record of this competition's
    // winners (Record Winners). Don't filter by announcement calendar year —
    // a competition started in fall may announce winners the following spring.
    for (const row of announcements || []) {
      const announcedAt = row.updated_at || row.created_at;

      const award = row.award
        ? {
            id: row.award.id,
            name: row.award.name,
            prize: row.award.prize || null,
            sort_order: row.award.sort_order ?? 999,
          }
        : {
            id: row.award_id || "unknown",
            name: "Award Winner",
            prize: null,
            sort_order: 999,
          };

      const joins = (row.announcement_winners || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      for (const join of joins) {
        const pitch = join.pitch;
        if (!pitch?.id) continue;
        if (pitch.moderation_status && pitch.moderation_status !== "approved") {
          continue;
        }
        const key = `${pitch.id}:${award.id}`;
        if (winnersByKey.has(key)) continue;
        winnersByKey.set(key, {
          id: pitch.id,
          name: pitch.name,
          title: pitch.title,
          file_type: pitch.file_type,
          file_name: pitch.file_name,
          thumbnail_path: pitch.thumbnail_path,
          mux_playback_id: pitch.mux_playback_id,
          award,
          source: "announcement",
          announced_at: announcedAt,
        });
      }
    }

    // ── Fallback: seed pitches tagged with this winner_year ──
    if (winnersByKey.size === 0) {
      const { data: seeds, error: seedErr } = await supabaseAdmin
        .from("pitches")
        .select(
          `
          id, name, title, file_type, file_name,
          thumbnail_path, mux_playback_id, winner_year, winner_award_id,
          winner_award:awards!winner_award_id ( id, name, prize, sort_order )
        `
        )
        .eq("is_seed", true)
        .eq("winner_year", year);

      if (seedErr && !isMissingRelationError(seedErr)) {
        return NextResponse.json({ error: seedErr.message }, { status: 500 });
      }

      for (const pitch of seeds || []) {
        const award = pitch.winner_award
          ? {
              id: pitch.winner_award.id,
              name: pitch.winner_award.name,
              prize: pitch.winner_award.prize || null,
              sort_order: pitch.winner_award.sort_order ?? 999,
            }
          : {
              id: pitch.winner_award_id || "archive",
              name: "Hall of Fame",
              prize: null,
              sort_order: 999,
            };
        const key = `${pitch.id}:${award.id}`;
        winnersByKey.set(key, {
          id: pitch.id,
          name: pitch.name,
          title: pitch.title,
          file_type: pitch.file_type,
          file_name: pitch.file_name,
          thumbnail_path: pitch.thumbnail_path,
          mux_playback_id: pitch.mux_playback_id,
          award,
          source: "archive",
          announced_at: null,
        });
      }
    }

    const winners = [...winnersByKey.values()].sort((a, b) => {
      if (a.award.sort_order !== b.award.sort_order) {
        return a.award.sort_order - b.award.sort_order;
      }
      const awardName = String(a.award.name || "").localeCompare(
        String(b.award.name || "")
      );
      if (awardName !== 0) return awardName;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });

    return NextResponse.json(
      {
        year,
        winners,
        defaults,
        count: winners.length,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
