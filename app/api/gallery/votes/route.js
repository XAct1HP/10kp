import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { fingerprintFromHeaders } from "../../../../lib/voteFingerprint";
import { canonicalInbox } from "../../../../lib/voteIntegrity";
import { checkVoteOnWrite } from "../../../../lib/voteRealtime";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// The vote budget is enforced per MAILBOX, not per address string.
// mziaulh+mark@ and mziaulh+omair@ are the same inbox — that is how mail
// delivery works, not a guess — so they share one allowance. Counting by
// voter_key instead is what let one person cast twelve votes with five
// as the stated limit.
async function getVotingSummary(supabaseAdmin, voterKey, pitchId) {
  const inbox = canonicalInbox(voterKey) || voterKey;

  const { count: pitchVoteCount } = await supabaseAdmin
    .from("pitch_votes")
    .select("id", { count: "exact", head: true })
    .eq("pitch_id", pitchId)
    .is("voided_at", null);

  const { count: userVoteCount } = await supabaseAdmin
    .from("pitch_votes")
    .select("id", { count: "exact", head: true })
    .eq("voter_inbox", inbox)
    .is("voided_at", null);

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
      .select("id, moderation_status, is_seed")
      .eq("id", pitchId)
      .limit(1)
      .maybeSingle();

    if (!pitch || pitch.moderation_status !== "approved") {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    // Past winners are an archive, not a ballot. They carry
    // moderation_status = 'approved' by construction, so the check above
    // would otherwise let them through.
    if (pitch.is_seed) {
      return NextResponse.json(
        { error: "Voting is closed for past winners." },
        { status: 403 }
      );
    }

    // Coarse, hashed request fingerprint. The ballot is open on purpose,
    // so this is the only handle the integrity detector has on "is this
    // the same person again?" — see lib/voteFingerprint.js for what is
    // (and isn't) stored. Every field is nullable and a missing header
    // must never cost someone their vote.
    const fingerprint = fingerprintFromHeaders(request.headers);

    // The mailbox behind the address. Stored so the budget, the duplicate
    // check and the detector all agree on who "one person" is.
    const voterInbox = canonicalInbox(normalizedEmail) || normalizedEmail;

    // Enforced here as well as by the unique index and the DB trigger,
    // because this is the only layer that can explain itself to the
    // voter. A same-mailbox alias hitting the ceiling gets told what
    // happened rather than a bare 500.
    const preflight = await getVotingSummary(supabaseAdmin, normalizedEmail, pitchId);
    if (preflight.remainingVotes <= 0) {
      return NextResponse.json(
        {
          error: `You have used all ${preflight.maxVotesPerUser} of your votes.`,
          ...preflight,
        },
        { status: 400 }
      );
    }

    const { error: voteError } = await supabaseAdmin.from("pitch_votes").insert({
      pitch_id: pitchId,
      user_id: null,
      voter_name: String(voterName).trim(),
      voter_email: normalizedEmail,
      voter_key: normalizedEmail,
      voter_inbox: voterInbox,
      ...fingerprint,
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

    // Score this vote against its own neighbourhood before answering, so
    // a ring is in the Integrity queue within seconds instead of waiting
    // for the next hourly sweep. Bounded by its own time budget and
    // incapable of failing the vote — see lib/voteRealtime.js.
    await checkVoteOnWrite(supabaseAdmin, {
      pitchId,
      voterInbox,
      voterKey: normalizedEmail,
      ipHash: fingerprint.ip_hash,
    });

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

    // Scoped to live votes on purpose: a voided vote is an admin
    // decision, and letting the voter delete the row would quietly free
    // up the slot it was voided for.
    const { data: deletedRows, error: deleteError } = await supabaseAdmin
      .from("pitch_votes")
      .delete()
      .eq("pitch_id", pitchId)
      .eq("voter_key", normalizedEmail)
      .is("voided_at", null)
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
