import { analyzeVotes, MIN_SCORE } from "./voteIntegrity.js";

// The full vote-integrity sweep, extracted so the hourly cron and the
// admin "Run sweep now" button are provably the same code path.
//
// Every run — scheduled, manual, successful or failed — writes a row to
// vote_sweeps. That table exists because of how the first incident was
// missed: the Integrity tab renders an identical, reassuring "Nothing
// flagged" whether the detector found nothing, was never scheduled (a
// Vercel Hobby project silently downgrades an hourly cron to daily), or
// returned 401 on a missing CRON_SECRET. An empty queue only means
// something if you can see when it was last filled.
//
// This never deletes a vote or changes a tally. Voiding is a deliberate,
// human, audited action taken in the admin UI.

export const LOOKBACK_DAYS = 45;
export const MAX_VOTES = 20_000;

/**
 * @param {object} supabase service-role client
 * @param {object} [options]
 * @param {"cron"|"manual"} [options.source]
 * @returns {Promise<object>} summary, including whether it succeeded
 */
export async function runVoteSweep(supabase, options = {}) {
  const { source = "cron" } = options;
  const started = Date.now();
  const nowIso = new Date().toISOString();

  const log = async (fields) => {
    // Best-effort: a sweep must not fail because its own logging failed,
    // but a missing log row is itself a signal, so it is never silent.
    const { error } = await supabase.from("vote_sweeps").insert({
      ran_at: nowIso,
      source,
      duration_ms: Date.now() - started,
      ...fields,
    });
    if (error) console.error("vote-integrity: sweep log failed:", error.message);
  };

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

    const [{ data: votes, error: votesError }, { data: pitches, error: pitchesError }] =
      await Promise.all([
        supabase
          .from("pitch_votes")
          .select(
            "id, pitch_id, voter_key, voter_inbox, voter_email, voter_name, created_at, ip_hash, ip_prefix_hash, user_agent_hash, geo_country, geo_city"
          )
          .is("voided_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(MAX_VOTES),
        supabase.from("pitches").select("id, title, uniqname, teammate_uniqnames"),
      ]);

    if (votesError) throw new Error(votesError.message);
    if (pitchesError) {
      // Pitch metadata only powers titles and self-vote detection. Losing
      // it degrades the report; it shouldn't abort the run.
      console.error("vote-integrity: pitch fetch failed:", pitchesError.message);
    }

    const { clusters, pitchRisk, stats } = analyzeVotes(votes || [], {
      pitches: pitches || [],
      minScore: MIN_SCORE,
    });

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
      detected_by: "sweep",
      last_seen_at: nowIso,
    }));

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase
        .from("vote_flags")
        .upsert(batch, { onConflict: "cluster_key", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
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
          review_note: "No longer detected — cleared automatically by the sweep.",
          reviewed_at: nowIso,
          reviewed_by: source === "manual" ? "admin (manual sweep)" : "cron",
        })
        .in("id", staleIds);
    }

    await log({
      ok: true,
      votes_analyzed: stats.votesAnalyzed,
      distinct_voters: stats.distinctVoters,
      clusters_found: stats.clustersFound,
      high: stats.high,
      medium: stats.medium,
      low: stats.low,
      upserted,
      auto_resolved: staleIds.length,
    });

    return {
      ok: true,
      ranAt: nowIso,
      source,
      lookbackDays: LOOKBACK_DAYS,
      stats,
      upserted,
      autoResolved: staleIds.length,
      topPitchRisk: pitchRisk.slice(0, 10),
      durationMs: Date.now() - started,
    };
  } catch (err) {
    await log({ ok: false, error: err.message });
    return { ok: false, ranAt: nowIso, source, error: err.message };
  }
}
