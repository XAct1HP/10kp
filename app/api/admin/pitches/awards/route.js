import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";
import { writeAudit } from "../../../../../lib/moderation/audit";
import { evaluateAwardEligibility } from "../../../../../lib/awards/eligibility";

export const runtime = "nodejs";
export const maxDuration = 60;

// PATCH /api/admin/pitches/awards
//
// Body: { pitchId, awardId, action: "include" | "exclude" | "recheck" }
//
//   include  — put the pitch in this award track and keep it there. Works
//              even if the submitter never selected it (the row is created).
//   exclude  — take the pitch out of the track.
//   recheck  — throw away the human override and let the relevance check
//              decide again from the pitch's current transcript / text.
//
// include and exclude stamp `overridden_by`, which the eligibility engine
// treats as final — a later re-run will not touch that row.

async function fetchTracks(supabase, pitchId) {
  const { data, error } = await supabase
    .from("pitch_awards")
    .select(
      `status, match_decision, match_confidence, match_reason, checked_at,
       overridden_by, overridden_at,
       awards ( id, name, is_raffle )`
    )
    .eq("pitch_id", pitchId);

  if (error) throw new Error(error.message);

  return (data || [])
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
}

export async function PATCH(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const pitchId = body.pitchId;
  const awardId = body.awardId;
  const action = body.action;

  if (!pitchId || !awardId) {
    return NextResponse.json({ error: "pitchId and awardId are required" }, { status: 400 });
  }
  if (!["include", "exclude", "recheck"].includes(action)) {
    return NextResponse.json(
      { error: 'action must be one of "include", "exclude", "recheck"' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const reviewer = auth.user.email;

  try {
    const { data: award } = await supabase
      .from("awards")
      .select("id, name")
      .eq("id", awardId)
      .single();
    if (!award) {
      return NextResponse.json({ error: "Award not found" }, { status: 404 });
    }

    if (action === "recheck") {
      // Clear the override AND the previous verdict so the engine starts
      // clean — including checked_at, which is its retry marker.
      const { error } = await supabase
        .from("pitch_awards")
        .update({
          status: "pending",
          match_decision: null,
          match_confidence: null,
          match_reason: null,
          checked_at: null,
          overridden_by: null,
          overridden_at: null,
        })
        .eq("pitch_id", pitchId)
        .eq("award_id", awardId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const result = await evaluateAwardEligibility(pitchId);
      await writeAudit(supabase, {
        pitchId,
        action: "admin_award_recheck",
        reviewedBy: reviewer,
        reason: `Re-ran the relevance check for "${award.name}".`,
        details: { award_id: awardId, result },
      });

      return NextResponse.json({ tracks: await fetchTracks(supabase, pitchId), result });
    }

    const include = action === "include";
    const { error } = await supabase.from("pitch_awards").upsert(
      {
        pitch_id: pitchId,
        award_id: awardId,
        status: include ? "eligible" : "removed",
        match_reason: include
          ? `Placed in this track by ${reviewer}.`
          : `Removed from this track by ${reviewer}.`,
        overridden_by: reviewer,
        overridden_at: now,
      },
      { onConflict: "pitch_id,award_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(supabase, {
      pitchId,
      action: include ? "admin_award_included" : "admin_award_excluded",
      reviewedBy: reviewer,
      reason: `${include ? "Added to" : "Removed from"} the "${award.name}" award track.`,
      details: { award_id: awardId },
    });

    return NextResponse.json({ tracks: await fetchTracks(supabase, pitchId) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/admin/pitches/awards?pitchId=... — the award tracks on one pitch.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { searchParams } = new URL(request.url);
  const pitchId = searchParams.get("pitchId");
  if (!pitchId) {
    return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ tracks: await fetchTracks(getSupabaseAdmin(), pitchId) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
