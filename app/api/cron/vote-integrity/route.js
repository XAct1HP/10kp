import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getModerationConfig } from "../../../../lib/env";
import { analyzeVotes, MIN_SCORE } from "../../../../lib/voteIntegrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled vote-integrity sweep. Runs hourly (Vercel Cron — see
// vercel.json).
//
// The gallery ballot is open by design: no login, no verified email. That
// makes a second identity cheap, so instead of blocking it we look for its
// fingerprints after the fact and put clusters in front of a human in the
// admin Votes tab.
//
// This route NEVER deletes a vote or changes a tally. It only writes rows
// to vote_flags. Voiding votes is a deliberate, human, audited action.
//
// Auth: same shared secret as the moderation cron. Vercel Cron injects
// `Authorization: Bearer <CRON_SECRET>` automatically.

// How far back to look. Long enough that a slow-drip attacker doesn't age
// out of the window between runs, short enough to stay a cheap query.
const LOOKBACK_DAYS = 45;
const MAX_VOTES = 20_000;

function isAuthorized(request) {
  const cfg = getModerationConfig();
  if (!cfg.cronSecret) return { ok: false, error: "CRON_SECRET not configured" };
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (provided && provided === cfg.cronSecret) return { ok: true };
  return { ok: false, error: "Unauthorized" };
}

export async function POST(request) { return handle(request); }
export async function GET(request) { return handle(request); }

async function handle(request) {
  const authz = isAuthorized(request);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

    const [{ data: votes, error: votesError }, { data: pitches, error: pitchesError }] =
      await Promise.all([
        supabase
          .from("pitch_votes")
          .select(
            "id, pitch_id, voter_key, voter_email, voter_name, created_at, ip_hash, ip_prefix_hash, user_agent_hash, geo_country, geo_city"
          )
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(MAX_VOTES),
        supabase.from("pitches").select("id, title, uniqname, teammate_uniqnames"),
      ]);

    if (votesError) {
      return NextResponse.json({ error: votesError.message }, { status: 500 });
    }
    if (pitchesError) {
      // Pitch metadata only powers titles and self-vote detection. Losing
      // it degrades the report; it shouldn't abort the run.
      console.error("vote-integrity: pitch fetch failed:", pitchesError.message);
    }

    const { clusters, pitchRisk, stats } = analyzeVotes(votes || [], {
      pitches: pitches || [],
      minScore: MIN_SCORE,
    });

    const nowIso = new Date().toISOString();

    // Upsert on cluster_key so a ring that grows between runs updates its
    // existing row (and keeps its triage status and reviewer note) rather
    // than reappearing as a fresh, un-reviewed flag.
    const rows = clusters.map((c) => ({
      cluster_key: c.clusterKey,
      cluster_type: c.clusterType,
      anchor_label: c.anchorLabel,
      pitch_id: c.pitchId,
      score: c.score,
      severity: c.severity,
      signals: c.signals,
      voter_keys: c.voterKeys,
      vote_ids: c.voteIds,
      voter_count: c.voterCount,
      vote_count: c.voteCount,
      evidence: c.evidence,
      last_seen_at: nowIso,
    }));

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase
        .from("vote_flags")
        .upsert(batch, { onConflict: "cluster_key", ignoreDuplicates: false });
      if (error) {
        return NextResponse.json(
          { error: error.message, upserted, stats },
          { status: 500 }
        );
      }
      upserted += batch.length;
    }

    // Clusters that no longer score above the threshold — usually because
    // an admin voided the votes behind them — are resolved rather than
    // deleted, so the audit trail survives.
    const liveKeys = new Set(rows.map((r) => r.cluster_key));
    const { data: openFlags } = await supabase
      .from("vote_flags")
      .select("id, cluster_key")
      .eq("status", "open");

    const staleIds = (openFlags || [])
      .filter((f) => !liveKeys.has(f.cluster_key))
      .map((f) => f.id);

    if (staleIds.length > 0) {
      await supabase
        .from("vote_flags")
        .update({
          status: "resolved",
          review_note: "No longer detected — cleared automatically by the hourly sweep.",
          reviewed_at: nowIso,
          reviewed_by: "cron",
        })
        .in("id", staleIds);
    }

    return NextResponse.json({
      ok: true,
      ranAt: nowIso,
      lookbackDays: LOOKBACK_DAYS,
      stats,
      upserted,
      autoResolved: staleIds.length,
      topPitchRisk: pitchRisk.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
