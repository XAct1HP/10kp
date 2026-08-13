import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Public gallery feed of all submissions.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") || "8", 10), 1),
      500
    );
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabaseAdmin = getSupabaseAdmin();

    // Read display toggles once up front so we can add filters
    // conditionally. Undefined column (pre-migration) is treated as true.
    const { data: settingsRow } = await supabaseAdmin
      .from("competition_settings")
      .select("seeds_visible, podium_visible")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const seedsVisible = settingsRow?.seeds_visible !== false;
    const podiumVisible = settingsRow?.podium_visible !== false;

    let query = supabaseAdmin
      .from("pitches")
      .select(`
        id,
        name,
        title,
        description,
        file_name,
        file_path,
        file_type,
        text_content,
        thumbnail_path,
        mux_asset_id,
        mux_status,
        mux_error,
        mux_playback_id,
        created_at,
        is_seed,
        pitch_tags (
          tags ( id, name )
        )
      `, { count: "exact" })
      // Only approved pitches are visible in the public gallery.
      // Defense in depth — check BOTH the v1 and v2 moderation columns.
      // The DB trigger already prevents non-service-role writes from
      // setting either column, but if a future migration accidentally
      // drops one filter the other still catches the mistake.
      .eq("moderation_status", "approved")
      .eq("moderation_state", "approved");

    if (!seedsVisible) {
      // Admin flipped the "show past winners" toggle off — usually once
      // enough real submissions exist to fill the gallery on their own.
      query = query.eq("is_seed", false);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const submissions = (data || []).map((pitch) => ({
      ...pitch,
      tags: pitch.pitch_tags?.map((pt) => pt.tags).filter(Boolean) || [],
      pitch_tags: undefined,
    }));

    const pitchIds = submissions.map((pitch) => pitch.id);
    const voteCountsByPitch = {};

    if (pitchIds.length > 0) {
      const { data: voteRows } = await supabaseAdmin
        .from("pitch_votes")
        .select("pitch_id")
        .in("pitch_id", pitchIds);

      (voteRows || []).forEach((row) => {
        voteCountsByPitch[row.pitch_id] = (voteCountsByPitch[row.pitch_id] || 0) + 1;
      });
    }

    const voterEmail = normalizeEmail(searchParams.get("voterEmail"));
    const voterKey = voterEmail || null;

    let userVotedPitchIds = new Set();
    let userVoteCount = 0;

    if (voterKey && pitchIds.length > 0) {
      const { data: userVotes } = await supabaseAdmin
        .from("pitch_votes")
        .select("pitch_id")
        .eq("voter_key", voterKey)
        .in("pitch_id", pitchIds);

      userVotedPitchIds = new Set((userVotes || []).map((row) => row.pitch_id));

      const { count: voteCount } = await supabaseAdmin
        .from("pitch_votes")
        .select("id", { count: "exact", head: true })
        .eq("voter_key", voterKey);
      userVoteCount = voteCount || 0;
    }

    const { data: settings } = await supabaseAdmin
      .from("competition_settings")
      .select("max_votes_per_user, default_audio_thumbnail, default_text_thumbnail")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxVotesPerUser = settings?.max_votes_per_user || 5;
    const defaultAudioThumbnail = settings?.default_audio_thumbnail || null;
    const defaultTextThumbnail = settings?.default_text_thumbnail || null;

    const submissionsWithVotes = submissions.map((pitch) => ({
      ...pitch,
      vote_count: voteCountsByPitch[pitch.id] || 0,
      user_has_voted: userVotedPitchIds.has(pitch.id),
    }));

    return NextResponse.json(
      {
        submissions: submissionsWithVotes,
        voting: {
          maxVotesPerUser,
          userVoteCount,
          remainingVotes: Math.max(maxVotesPerUser - userVoteCount, 0),
        },
        defaults: {
          audioThumbnail: defaultAudioThumbnail,
          textThumbnail: defaultTextThumbnail,
        },
        display: {
          podiumVisible,
        },
        pagination: {
          page,
          pageSize,
          total: count || 0,
          hasMore: from + (data?.length || 0) < (count || 0),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
