import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import {
  VOTE_RISK_STATUS,
  rescoreRecentVotes,
  scoreAndPersistVote,
} from "../../../../lib/votes/risk";

function isMissingRiskColumn(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message || "";
  return (
    /vote_risk_/i.test(msg) &&
    (/does not exist/i.test(msg) || /schema cache/i.test(msg))
  );
}

const RISK_SELECT = `
  id,
  pitch_id,
  user_id,
  voter_name,
  voter_email,
  created_at,
  vote_risk_score,
  vote_risk_reasons,
  vote_risk_status,
  vote_risk_scored_at,
  pitches (
    title,
    name
  )
`;

const BASE_SELECT = `
  id,
  pitch_id,
  user_id,
  voter_name,
  voter_email,
  created_at,
  pitches (
    title,
    name
  )
`;

function mapVote(vote, riskReady) {
  return {
    id: vote.id,
    pitch_id: vote.pitch_id,
    user_id: vote.user_id,
    voter_name: vote.voter_name,
    voter_email: vote.voter_email,
    created_at: vote.created_at,
    pitch_title: vote.pitches?.title || "Untitled pitch",
    pitch_submitter: vote.pitches?.name || "Unknown submitter",
    vote_risk_score: riskReady ? vote.vote_risk_score || 0 : 0,
    vote_risk_reasons: riskReady
      ? Array.isArray(vote.vote_risk_reasons)
        ? vote.vote_risk_reasons
        : []
      : [],
    vote_risk_status: riskReady
      ? vote.vote_risk_status || VOTE_RISK_STATUS.CLEAR
      : VOTE_RISK_STATUS.CLEAR,
    vote_risk_scored_at: riskReady ? vote.vote_risk_scored_at || null : null,
  };
}

// GET — fetch recent vote mappings (admin only)
// Query: ?status=all|suspicious|review|dismissed|clear
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") || "all").toLowerCase();

    let query = supabaseAdmin
      .from("pitch_votes")
      .select(RISK_SELECT)
      .limit(500);

    if (status === "suspicious" || status === "review") {
      query = query
        .eq("vote_risk_status", VOTE_RISK_STATUS.REVIEW)
        .order("vote_risk_score", { ascending: false })
        .order("created_at", { ascending: false });
    } else if (status === "dismissed") {
      query = query
        .eq("vote_risk_status", VOTE_RISK_STATUS.DISMISSED)
        .order("created_at", { ascending: false });
    } else if (status === "clear") {
      query = query
        .eq("vote_risk_status", VOTE_RISK_STATUS.CLEAR)
        .order("created_at", { ascending: false });
    } else {
      // All: surface risky votes first, then newest.
      query = query
        .order("vote_risk_score", { ascending: false })
        .order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error && isMissingRiskColumn(error)) {
      const fallback = await supabaseAdmin
        .from("pitch_votes")
        .select(BASE_SELECT)
        .order("created_at", { ascending: false })
        .limit(500);
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      }
      return NextResponse.json({
        votes: (fallback.data || []).map((v) => mapVote(v, false)),
        riskReady: false,
        counts: { all: fallback.data?.length || 0, review: 0, dismissed: 0, clear: 0 },
      });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const votes = (data || []).map((v) => mapVote(v, true));

    // Lightweight counts for filter chips (separate head queries).
    const [allC, reviewC, dismissedC, clearC] = await Promise.all([
      supabaseAdmin
        .from("pitch_votes")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("pitch_votes")
        .select("id", { count: "exact", head: true })
        .eq("vote_risk_status", VOTE_RISK_STATUS.REVIEW),
      supabaseAdmin
        .from("pitch_votes")
        .select("id", { count: "exact", head: true })
        .eq("vote_risk_status", VOTE_RISK_STATUS.DISMISSED),
      supabaseAdmin
        .from("pitch_votes")
        .select("id", { count: "exact", head: true })
        .eq("vote_risk_status", VOTE_RISK_STATUS.CLEAR),
    ]);

    return NextResponse.json({
      votes,
      riskReady: true,
      counts: {
        all: allC.count || 0,
        review: reviewC.count || 0,
        dismissed: dismissedC.count || 0,
        clear: clearC.count || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — update risk status or rescore a single vote
// Body: { id, vote_risk_status?: 'clear'|'review'|'dismissed', rescore?: true }
export async function PATCH(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body?.id;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  if (body.rescore) {
    try {
      const result = await scoreAndPersistVote(supabaseAdmin, id);
      if (!result || result.skipped) {
        return NextResponse.json(
          { error: "Vote risk columns not available. Run migrations/20260825_vote_risk_scoring.sql." },
          { status: 503 }
        );
      }
      return NextResponse.json({ vote: result });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  const nextStatus = String(body.vote_risk_status || "").toLowerCase();
  if (!Object.values(VOTE_RISK_STATUS).includes(nextStatus)) {
    return NextResponse.json(
      { error: "vote_risk_status must be clear, review, or dismissed." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("pitch_votes")
    .update({
      vote_risk_status: nextStatus,
      vote_risk_scored_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id, vote_risk_score, vote_risk_reasons, vote_risk_status, vote_risk_scored_at"
    )
    .maybeSingle();

  if (error) {
    if (isMissingRiskColumn(error)) {
      return NextResponse.json(
        { error: "Vote risk columns not available. Run migrations/20260825_vote_risk_scoring.sql." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Vote not found." }, { status: 404 });
  }

  return NextResponse.json({ vote: data });
}

// POST — trigger a batch rescore (admin manual refresh)
export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let limit = 100;
  try {
    const body = await request.json();
    if (body?.limit) limit = Math.min(500, Math.max(1, Number(body.limit) || 100));
  } catch {
    // empty body is fine
  }

  const supabaseAdmin = getSupabaseAdmin();
  try {
    const result = await rescoreRecentVotes(supabaseAdmin, { limit });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
