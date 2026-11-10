// Shared Hall of Fame assembly.
//
// Public page and admin editor must agree on who appears. Source of truth:
//   1. Published award announcements (Record Winners) — primary
//   2. Seed pitches with matching winner_year — fallback only when (1) is empty

const ANNOUNCEMENT_SELECT = `
  id, title, content, created_at, updated_at, award_id, is_published,
  award:awards ( id, name, description, prize, sort_order, is_raffle ),
  announcement_winners ( sort_order,
    pitch:pitches (
      id, name, title, file_type, file_name,
      thumbnail_path, mux_playback_id, moderation_status, is_seed
    )
  )
`;

export function competitionYearFromSettings(competitionDate) {
  if (competitionDate) {
    const y = new Date(competitionDate).getFullYear();
    if (Number.isFinite(y)) return y;
  }
  return new Date().getFullYear();
}

export function isMissingRelationError(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST204" ||
    /does not exist|schema cache|could not find/i.test(error?.message || "")
  );
}

export function thumbDefaults(settings) {
  return {
    audioThumbnail: settings?.default_audio_thumbnail || null,
    textThumbnail: settings?.default_text_thumbnail || null,
  };
}

function sortWinners(winners) {
  return [...winners].sort((a, b) => {
    // Sponsored awards first; weekly drawing / raffle awards after.
    const aRaffle = a.award?.is_raffle ? 1 : 0;
    const bRaffle = b.award?.is_raffle ? 1 : 0;
    if (aRaffle !== bRaffle) return aRaffle - bRaffle;

    if (a.award.sort_order !== b.award.sort_order) {
      return a.award.sort_order - b.award.sort_order;
    }
    const awardName = String(a.award.name || "").localeCompare(
      String(b.award.name || "")
    );
    if (awardName !== 0) return awardName;
    // Within an award, keep announcement order when available, then title.
    const aAnn = a.announced_at ? new Date(a.announced_at).getTime() : 0;
    const bAnn = b.announced_at ? new Date(b.announced_at).getTime() : 0;
    if (aAnn !== bAnn) return aAnn - bAnn;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function awardFromRow(row) {
  if (row.award) {
    return {
      id: row.award.id,
      name: row.award.name,
      prize: row.award.prize || null,
      sort_order: row.award.sort_order ?? 999,
      is_raffle: Boolean(row.award.is_raffle),
    };
  }
  return {
    id: row.award_id || "unknown",
    name: "Award Winner",
    prize: null,
    sort_order: 999,
    is_raffle: false,
  };
}

function collectFromAnnouncements(announcements) {
  const winnersByKey = new Map();
  const announcementByAward = new Map();

  for (const row of announcements || []) {
    if (!row.is_published) continue;
    const announcedAt = row.updated_at || row.created_at;
    const award = awardFromRow(row);

    if (row.award_id && !announcementByAward.has(row.award_id)) {
      announcementByAward.set(row.award_id, {
        id: row.id,
        title: row.title,
        content: row.content || "",
        award_id: row.award_id,
        is_published: true,
        updated_at: row.updated_at,
        created_at: row.created_at,
        winners: (row.announcement_winners || [])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((j) => j.pitch)
          .filter(Boolean),
      });
    }

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
        announcement_id: row.id,
      });
    }
  }

  return { winnersByKey, announcementByAward };
}

async function collectSeedFallback(supabaseAdmin, year, winnersByKey) {
  if (winnersByKey.size > 0) return;

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

  if (seedErr) {
    if (isMissingRelationError(seedErr)) return;
    throw new Error(seedErr.message);
  }

  for (const pitch of seeds || []) {
    const award = pitch.winner_award
      ? {
          id: pitch.winner_award.id,
          name: pitch.winner_award.name,
          prize: pitch.winner_award.prize || null,
          sort_order: pitch.winner_award.sort_order ?? 999,
          is_raffle: Boolean(pitch.winner_award.is_raffle),
        }
      : {
          id: pitch.winner_award_id || "archive",
          name: "Hall of Fame",
          prize: null,
          sort_order: 999,
          is_raffle: false,
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
      announcement_id: null,
    });
  }
}

export async function loadHallOfFame(supabaseAdmin) {
  let settings = null;
  {
    const first = await supabaseAdmin
      .from("competition_settings")
      .select(
        "competition_date, default_audio_thumbnail, default_text_thumbnail, hall_of_fame_public"
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (first.error && isMissingRelationError(first.error)) {
      // Pre-migration: column not present yet — treat as private.
      const fallback = await supabaseAdmin
        .from("competition_settings")
        .select(
          "competition_date, default_audio_thumbnail, default_text_thumbnail"
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      settings = fallback.data;
    } else if (first.error) {
      throw new Error(first.error.message);
    } else {
      settings = first.data;
    }
  }

  // Pre-migration / NULL / false => private (matches prior admin-only gate).
  const isPublic = settings?.hall_of_fame_public === true;
  const year = competitionYearFromSettings(settings?.competition_date);
  const defaults = thumbDefaults(settings);

  const { data: announcements, error: annErr } = await supabaseAdmin
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .eq("announcement_type", "award")
    .order("updated_at", { ascending: false });

  if (annErr && !isMissingRelationError(annErr)) {
    throw new Error(annErr.message);
  }

  const { winnersByKey, announcementByAward } = collectFromAnnouncements(
    announcements
  );
  await collectSeedFallback(supabaseAdmin, year, winnersByKey);

  const winners = sortWinners([...winnersByKey.values()]);

  return {
    year,
    winners,
    defaults,
    count: winners.length,
    isPublic,
    announcementByAward,
    awardAnnouncements: (announcements || []).map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content || "",
      award_id: row.award_id,
      is_published: !!row.is_published,
      updated_at: row.updated_at,
      created_at: row.created_at,
      award: row.award
        ? {
            id: row.award.id,
            name: row.award.name,
            prize: row.award.prize || null,
            sort_order: row.award.sort_order ?? 999,
          }
        : null,
      winners: (row.announcement_winners || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((j) => j.pitch)
        .filter(Boolean),
    })),
  };
}
