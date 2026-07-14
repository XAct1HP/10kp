import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getVotingSummary(supabaseAdmin, voterKey, pitchId) {
  const { count: pitchVoteCount } = await supabaseAdmin
    .from("pitch_votes")
    .select("id", { count: "exact", head: true })
    .eq("pitch_id", pitchId);

  const { count: userVoteCount } = await supabaseAdmin
    .from("pitch_votes")
    .select("id", { count: "exact", head: true })
    .eq("voter_key", voterKey);

  const { data: settings } = await supabaseAdmin
    .from("competition_settings")
    .select("max_votes_per_user")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxVotesPerUser = settings?.max_votes_per_user || 5;

  return {
    pitchVoteCount: pitchVoteCount || 0,
    userVoteCount: userVoteCount || 0,
    maxVotesPerUser,
    remainingVotes: Math.max(maxVotesPerUser - (userVoteCount || 0), 0),
  };
}

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { pitchId, voterName, voterEmail } = await request.json();
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }
    if (!voterName || !String(voterName).trim()) {
      return NextResponse.json({ error: "voterName is required" }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(voterEmail);
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "A valid voterEmail is required" }, { status: 400 });
    }

    // Use admin client so vote eligibility does not depend on pitch RLS visibility.
    // Only approved pitches can be voted on — un-moderated pitches never
    // appear in the public gallery, so they must not be votable either.
    const { data: pitch } = await supabaseAdmin
      .from("pitches")
      .select("id, moderation_status")
      .eq("id", pitchId)
      .limit(1)
      .maybeSingle();

    if (!pitch || pitch.moderation_status !== "approved") {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    const { error: voteError } = await supabaseAdmin.from("pitch_votes").insert({
      pitch_id: pitchId,
      user_id: null,
      voter_name: String(voterName).trim(),
      voter_email: normalizedEmail,
      voter_key: normalizedEmail,
    });

    if (voteError) {
      if (voteError.code === "23505") {
        return NextResponse.json(
          { error: "You have already voted for this pitch." },
          { status: 409 }
        );
      }

      if (voteError.code === "P0001" && voteError.message === "MAX_VOTES_REACHED") {
        return NextResponse.json(
          { error: "You have reached the maximum number of votes." },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: voteError.message }, { status: 500 });
    }

    const summary = await getVotingSummary(supabaseAdmin, normalizedEmail, pitchId);

    return NextResponse.json({
      success: true,
      action: "voted",
      pitchId,
      ...summary,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { pitchId, voterEmail } = await request.json();
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }
    const normalizedEmail = normalizeEmail(voterEmail);
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "A valid voterEmail is required" }, { status: 400 });
    }

    const { data: deletedRows, error: deleteError } = await supabaseAdmin
      .from("pitch_votes")
      .delete()
      .eq("pitch_id", pitchId)
      .eq("voter_key", normalizedEmail)
      .select("id");

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json({ error: "Vote not found." }, { status: 404 });
    }

    const summary = await getVotingSummary(supabaseAdmin, normalizedEmail, pitchId);

    return NextResponse.json({
      success: true,
      action: "unvoted",
      pitchId,
      ...summary,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
