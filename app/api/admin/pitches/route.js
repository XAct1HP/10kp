import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";
import { getUserEmailMap } from "../../../../lib/adminOutreach";

// A column or embedded relationship the database does not have yet fails the
// whole query. Detect that specific class of failure so selectPitches can
// retry with a narrower column set instead of blanking the Pitches tab.
function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST204" ||
    /Could not find a relationship/i.test(error?.message || "") ||
    /column .* does not exist/i.test(error?.message || "") ||
    /Could not find the '.*' column of '.*' in the schema cache/i.test(error?.message || "")
  );
}

// Column list is assembled rather than hardcoded twice: two independent
// migrations can each be missing on a database that trails the deploy, and
// asking for a column or relationship that isn't there fails the WHOLE query,
// which would blank the admin Pitches tab.
//   • uniqname / teammate_uniqnames — migrations/20260824_add_uniqnames_to_pitches.sql
//   • pitch_awards                  — migrations/20260825_award_tracks.sql
function buildPitchColumns({ uniqnames = true, awards = true } = {}) {
  return [
    "id",
    "user_id",
    "name",
    ...(uniqnames ? ["uniqname", "teammate_uniqnames"] : []),
    "role",
    "student_level",
    "schools",
    "title",
    "description",
    "file_name",
    "file_type",
    "file_path",
    "text_content",
    "thumbnail_path",
    "mux_asset_id",
    "mux_status",
    "mux_error",
    "mux_playback_id",
    "created_at",
    "moderation_status",
    "moderation_reason",
    "moderation_flags",
    "moderation_transcript",
    "moderation_reviewed_by",
    "moderation_reviewed_at",
    "moderation_priority",
    "moderation_checked_at",
    "moderation_state",
    "moderation_summary",
    "moderation_reasons",
    "moderation_categories",
    "moderation_scores",
    "moderation_admin_notes",
    "moderation_attempt_count",
    "moderation_last_error",
    "moderation_next_attempt_at",
    "moderation_started_at",
    "moderation_completed_at",
    "visual_moderation_status",
    "visual_moderation_result",
    "transcript_moderation_status",
    "transcript_moderation_result",
    "mux_moderation_job_id",
    "mux_moderation_result",
    "transcript",
    "transcript_status",
    "transcript_language",
    "transcript_last_error",
    "media_status",
    "is_seed",
    "pitch_tags ( tags ( id, name ) )",
    ...(awards
      ? [
          `pitch_awards (
             status, match_decision, match_confidence, match_reason,
             checked_at, overridden_by, overridden_at,
             awards ( id, name, is_raffle )
           )`,
        ]
      : []),
    "pitch_votes ( user_id, voter_name, voter_email, created_at )",
  ].join(",\n        ");
}

// Flatten the pitch_awards embed into the shape the admin UI filters and
// renders from. `award_tracks` is every selection the submitter made, verdict
// included; `award_ids` is just the ones the pitch is actually still in, which
// is what the track filter matches against.
function decorateAwardTracks(pitch) {
  const tracks = (pitch.pitch_awards || [])
    .map((row) => {
      const award = Array.isArray(row.awards) ? row.awards[0] : row.awards;
      if (!award) return null;
      return {
        award_id: award.id,
        name: award.name,
        is_raffle: Boolean(award.is_raffle),
        status: row.status,
        match_decision: row.match_decision,
        match_confidence: row.match_confidence,
        match_reason: row.match_reason,
        checked_at: row.checked_at,
        overridden_by: row.overridden_by,
        overridden_at: row.overridden_at,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    award_tracks: tracks,
    award_ids: tracks.filter((t) => t.status === "eligible").map((t) => t.award_id),
  };
}

async function selectPitches(supabaseAdmin) {
  const run = (columns) =>
    supabaseAdmin
      .from("pitches")
      .select(columns)
      // Order flagged pitches to the top, then pending, then everything else
      // (approved / rejected / errored). Within each bucket, newest first.
      .order("moderation_priority", { ascending: false })
      .order("created_at", { ascending: false });

  // Widest first, then drop one optional piece at a time.
  const attempts = [
    { uniqnames: true, awards: true },
    { uniqnames: true, awards: false },
    { uniqnames: false, awards: true },
    { uniqnames: false, awards: false },
  ];

  let result;
  for (const attempt of attempts) {
    result = await run(buildPitchColumns(attempt));
    if (!result.error || !isMissingColumnError(result.error)) return result;
  }
  return result;
}

// GET — fetch all pitches with their tags (admin only)
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await selectPitches(supabaseAdmin);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const STATUS_RANK = { flagged: 0, pending: 1, errored: 2, approved: 3, rejected: 4 };

    // Submitter account emails live in auth.users, not in the pitches table.
    // The CSV export needs them, so resolve them here rather than making the
    // client fetch a second endpoint. A failure must not take the whole admin
    // pitches list down — the email column just comes back blank.
    let emailMap = new Map();
    try {
      emailMap = await getUserEmailMap(supabaseAdmin);
    } catch {
      emailMap = new Map();
    }

    // Flatten the nested pitch_tags → tags structure and sort by moderation state
    const pitches = data
      .map((pitch) => ({
        ...pitch,
        submitter_email: emailMap.get(pitch.user_id) || null,
        tags: pitch.pitch_tags?.map((pt) => pt.tags).filter(Boolean) || [],
        ...decorateAwardTracks(pitch),
        votes: pitch.pitch_votes || [],
        vote_count: pitch.pitch_votes?.length || 0,
        pitch_tags: undefined,
        pitch_awards: undefined,
        pitch_votes: undefined,
      }))
      .sort((a, b) => {
        const ra = STATUS_RANK[a.moderation_status] ?? 99;
        const rb = STATUS_RANK[b.moderation_status] ?? 99;
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    return NextResponse.json(pitches);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove a pitch and its associated data (admin only)
export async function DELETE(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const pitchId = searchParams.get("id");
    if (!pitchId) {
      return NextResponse.json({ error: "Missing pitch id" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch pitch to get file info before deleting
    const { data: pitch } = await supabaseAdmin
      .from("pitches")
      .select("id, file_path, thumbnail_path, mux_asset_id")
      .eq("id", pitchId)
      .single();

    if (!pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    // Delete associated votes
    await supabaseAdmin.from("pitch_votes").delete().eq("pitch_id", pitchId);

    // Delete associated tags
    await supabaseAdmin.from("pitch_tags").delete().eq("pitch_id", pitchId);

    // Delete associated award tracks (the FK cascades, but this keeps the
    // delete path explicit and works even if the FK is ever relaxed).
    await supabaseAdmin.from("pitch_awards").delete().eq("pitch_id", pitchId);

    // Delete file from storage if exists
    if (pitch.file_path) {
      await supabaseAdmin.storage.from("pitch-files").remove([pitch.file_path]);
    }

    // Delete thumbnail from storage if exists
    if (pitch.thumbnail_path) {
      await supabaseAdmin.storage.from("thumbnails").remove([pitch.thumbnail_path]);
    }

    // Delete the pitch record
    const { error } = await supabaseAdmin.from("pitches").delete().eq("id", pitchId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Delete Mux asset if this was a video pitch
    if (pitch.mux_asset_id) {
      try {
        const mux = getMuxClient();
        await mux.video.assets.delete(pitch.mux_asset_id);
      } catch (muxErr) {
        // Log but don't fail the delete if Mux cleanup fails
        console.error("Mux asset deletion failed:", muxErr.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
