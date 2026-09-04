import { analyzeVotes, MIN_SCORE } from "./voteIntegrity.js";

// Vote-time integrity check.
//
// WHY THIS EXISTS
// On 2026-09-04 twelve votes from twelve sub-addresses of one mailbox
// landed on that mailbox owner's own pitch in eight minutes. Replayed
// against the detector the cluster scores 100/high — it was simply never
// looked at, because the only thing that looks was an hourly cron. Even
// working perfectly that cron leaves a window of up to sixty minutes in
// which a ballot can be stuffed and the admin watching the Votes tab sees
// a clean screen.
//
// So the same engine now also runs on the way in, over a narrow slice of
// votes instead of the whole window: the mailbox that just voted, the
// address it voted from, and the pitch it voted for. Cheap enough to sit
// in the request path, and it puts the flag in the queue in seconds.
//
// WHAT IT IS NOT
// It is not a gate. It runs AFTER the insert, its result never changes
// the response, and any failure — timeout, missing table, bad data — is
// swallowed. A vote must never be lost because the detector had a bad
// day, and the hourly sweep re-checks everything regardless.

const SLICE_LOOKBACK_DAYS = 45;
const BURST_LOOKBACK_MS = 3 * 3_600_000;
const SLICE_LIMIT = 300;
const HISTORY_LIMIT = 1_000;

// Hard ceiling on how long a voter waits for us. The sweep is the
// backstop, so giving up here costs latency in the queue, nothing more.
const TIME_BUDGET_MS = 2_500;

function withBudget(promise) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), TIME_BUDGET_MS)),
  ]);
}

function mergeById(...lists) {
  const out = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      if (row?.id) out.set(row.id, row);
    }
  }
  return [...out.values()];
}

const VOTE_COLUMNS =
  "id, pitch_id, voter_key, voter_inbox, voter_email, voter_name, created_at, ip_hash, ip_prefix_hash, user_agent_hash, geo_country, geo_city";

async function run(supabase, { pitchId, voterInbox, voterKey, ipHash }) {
  const sinceIso = new Date(Date.now() - SLICE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const burstSince = new Date(Date.now() - BURST_LOOKBACK_MS).toISOString();

  // Voided votes are settled business — they must not keep resurrecting
  // the flag that got them voided in the first place.
  const live = (q) => q.is("voided_at", null);

  const queries = [
    live(
      supabase
        .from("pitch_votes")
        .select(VOTE_COLUMNS)
        .eq("voter_inbox", voterInbox || voterKey)
        .gte("created_at", sinceIso)
        .limit(SLICE_LIMIT)
    ),
    live(
      supabase
        .from("pitch_votes")
        .select(VOTE_COLUMNS)
        .eq("pitch_id", pitchId)
        .gte("created_at", burstSince)
        .limit(SLICE_LIMIT)
    ),
  ];

  if (ipHash) {
    queries.push(
      live(
        supabase
          .from("pitch_votes")
          .select(VOTE_COLUMNS)
          .eq("ip_hash", ipHash)
          .gte("created_at", sinceIso)
          .limit(SLICE_LIMIT)
      )
    );
  }

  const results = await Promise.all(queries);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  let slice = mergeById(...results.map((r) => r.data));
  if (slice.length === 0) return { upserted: 0 };

  // Every identity in the slice needs its FULL history, not just the part
  // that happens to fall inside it. `single_purpose` and the identical-
  // ballot check ask "has this identity ever voted for anything else?",
  // and answered from a slice the answer is always a misleading no —
  // which would have every first-time voter looking like a sock puppet.
  const voterKeys = [...new Set(slice.map((v) => v.voter_key).filter(Boolean))].slice(0, 120);
  if (voterKeys.length > 0) {
    const { data: history } = await live(
      supabase
        .from("pitch_votes")
        .select(VOTE_COLUMNS)
        .in("voter_key", voterKeys)
        .gte("created_at", sinceIso)
        .limit(HISTORY_LIMIT)
    );
    slice = mergeById(slice, history);
  }

  const pitchIds = [...new Set(slice.map((v) => v.pitch_id).filter(Boolean))];
  const { data: pitches } = await supabase
    .from("pitches")
    .select("id, title, uniqname, teammate_uniqnames")
    .in("id", pitchIds);

  const { clusters } = analyzeVotes(slice, {
    pitches: pitches || [],
    minScore: MIN_SCORE,
  });

  if (clusters.length === 0) return { upserted: 0 };

  const nowIso = new Date().toISOString();
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
    detected_by: "realtime",
    last_seen_at: nowIso,
  }));

  // Same cluster_key the sweep uses, so a ring caught on the way in and
  // then re-seen by the hourly pass stays one row with one triage state
  // rather than splitting into a realtime copy and a sweep copy.
  const { error } = await supabase
    .from("vote_flags")
    .upsert(rows, { onConflict: "cluster_key", ignoreDuplicates: false });
  if (error) throw new Error(error.message);

  return { upserted: rows.length, top: clusters[0]?.score || 0 };
}

/**
 * Check a freshly cast vote. Resolves to a small summary; never rejects.
 *
 * @param {object} supabase  service-role client
 * @param {object} vote      { pitchId, voterInbox, voterKey, ipHash }
 */
export async function checkVoteOnWrite(supabase, vote) {
  const started = Date.now();
  try {
    const result = await withBudget(run(supabase, vote));
    if (result?.timedOut) {
      return { ok: false, skipped: "time-budget", ms: Date.now() - started };
    }
    return { ok: true, ...result, ms: Date.now() - started };
  } catch (err) {
    // Logged, not surfaced. The voter's ballot is already in the table and
    // the hourly sweep will cover whatever this missed.
    console.error("vote-integrity (realtime):", err.message);
    return { ok: false, error: err.message, ms: Date.now() - started };
  }
}
