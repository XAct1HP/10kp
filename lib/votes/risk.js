/**
 * Deterministic vote-risk scoring for Admin → Votes suspicious filter.
 *
 * Signals (weighted, summed, capped at 100):
 *   - burst_velocity          many votes on one pitch in a short window
 *   - near_duplicate_emails   +tag / gmail-dot variants on same pitch
 *   - temp_email_domain       disposable / throwaway domains
 *   - rapid_max_cap           one email burns its vote cap across pitches fast
 *   - single_pitch_brigade    many one-and-done emails piled on one pitch
 *   - self_vote               voter looks like the pitch submitter
 *   - rare_domain_cluster     uncommon domain floods one pitch
 */

export const VOTE_RISK_STATUS = {
  CLEAR: "clear",
  REVIEW: "review",
  DISMISSED: "dismissed",
};

/** Score at or above this auto-sets status to `review` (unless dismissed). */
export const RISK_REVIEW_THRESHOLD = 40;

const BURST_WINDOW_MS = 60 * 60 * 1000;
const BURST_COUNT = 5;
const RAPID_CAP_WINDOW_MS = 2 * 60 * 1000;
const DOMAIN_CLUSTER_MIN = 3;
const SINGLE_PITCH_BRIGADE_MIN = 4;

const COMMON_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "umich.edu",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "msn.com",
]);

const TEMP_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "throwaway.email",
  "yopmail.com",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "discard.email",
  "mailnesia.com",
  "maildrop.cc",
  "tempail.com",
]);

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/** Collapse +tags and gmail dots so near-duplicates collide. */
export function canonicalizeEmail(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return normalized;
  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function emailDomain(email) {
  const n = normalizeEmail(email);
  const at = n.lastIndexOf("@");
  return at > 0 ? n.slice(at + 1) : "";
}

export function isTempEmailDomain(email) {
  return TEMP_DOMAINS.has(emailDomain(email));
}

/**
 * Rough affinity between a display name and an email local-part.
 * Used for self-vote when auth email lookup is unavailable.
 */
export function nameEmailAffinity(name, email) {
  const local = normalizeEmail(email)
    .split("@")[0]
    .split("+")[0]
    .replace(/[^a-z0-9]/g, "");
  if (!local || local.length < 3) return 0;

  const parts = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2);
  if (!parts.length) return 0;

  const first = parts[0];
  const last = parts[parts.length - 1];
  let score = 0;
  if (first.length >= 3 && local.includes(first.replace(/[^a-z0-9]/g, ""))) score += 1;
  if (last.length >= 3 && local.includes(last.replace(/[^a-z0-9]/g, ""))) score += 1;
  const compact = parts.join("").replace(/[^a-z0-9]/g, "");
  if (compact.length >= 5 && (local.includes(compact) || compact.includes(local))) score += 1;
  return score;
}

function isMissingRiskColumn(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message || "";
  return (
    /vote_risk_/i.test(msg) &&
    (/does not exist/i.test(msg) || /schema cache/i.test(msg))
  );
}

/**
 * Pure scorer — given the vote + related rows, return { score, reasons }.
 * `peerVotes` = other votes on the same pitch (may include self).
 * `voterVotes` = all votes by this voter_key (may include self).
 * `ownerEmail` = pitch owner's auth email if known.
 * `pitchSubmitterName` = pitches.name
 * `maxVotesPerUser` = competition cap (default 5)
 */
export function computeVoteRisk({
  vote,
  peerVotes = [],
  voterVotes = [],
  ownerEmail = null,
  pitchSubmitterName = null,
  maxVotesPerUser = 5,
  now = Date.now(),
}) {
  const reasons = [];
  let score = 0;

  const voterEmail = normalizeEmail(vote.voter_email || vote.voter_key);
  const createdAt = new Date(vote.created_at || now).getTime();
  const canon = canonicalizeEmail(voterEmail);

  // --- Burst velocity: N votes / pitch / hour ---
  const burstPeers = peerVotes.filter((v) => {
    const t = new Date(v.created_at).getTime();
    return Math.abs(createdAt - t) <= BURST_WINDOW_MS;
  });
  if (burstPeers.length >= BURST_COUNT) {
    score += 35;
    reasons.push({
      code: "burst_velocity",
      weight: 35,
      detail: `${burstPeers.length} votes on this pitch within 1 hour`,
    });
  }

  // --- Near-duplicate emails on same pitch ---
  const nearDupPeers = peerVotes.filter((v) => {
    if (v.id === vote.id) return false;
    const other = normalizeEmail(v.voter_email || v.voter_key);
    if (!other) return false;
    if (canonicalizeEmail(other) === canon) return true;
    // Same local before +tag, different domain still counts soft
    const a = voterEmail.split("+")[0];
    const b = other.split("+")[0];
    return a && b && a === b;
  });
  if (nearDupPeers.length >= 1) {
    const weight = Math.min(40, 20 + nearDupPeers.length * 10);
    score += weight;
    reasons.push({
      code: "near_duplicate_emails",
      weight,
      detail: `${nearDupPeers.length} near-duplicate email(s) also voted for this pitch`,
    });
  }

  // --- Temp / disposable domain ---
  if (isTempEmailDomain(voterEmail)) {
    score += 25;
    reasons.push({
      code: "temp_email_domain",
      weight: 25,
      detail: `Disposable-looking domain (${emailDomain(voterEmail)})`,
    });
  }

  // --- Rapid max-cap across unrelated pitches ---
  if (voterVotes.length >= maxVotesPerUser) {
    const times = voterVotes
      .map((v) => new Date(v.created_at).getTime())
      .sort((a, b) => a - b);
    const span = times[times.length - 1] - times[0];
    const uniquePitches = new Set(voterVotes.map((v) => v.pitch_id)).size;
    if (span <= RAPID_CAP_WINDOW_MS && uniquePitches >= Math.min(3, maxVotesPerUser)) {
      score += 40;
      reasons.push({
        code: "rapid_max_cap",
        weight: 40,
        detail: `${voterVotes.length} votes across ${uniquePitches} pitches in ${Math.max(1, Math.round(span / 1000))}s`,
      });
    }
  }

  // --- Single-pitch brigade: many emails whose only vote is this pitch ---
  const singlePitchVoters = peerVotes.filter((v) => v._onlyVoteOnThisPitch === true);
  const thisIsSingle =
    voterVotes.filter((v) => v.pitch_id !== vote.pitch_id).length === 0 &&
    voterVotes.length <= 1;
  if (thisIsSingle && singlePitchVoters.length >= SINGLE_PITCH_BRIGADE_MIN) {
    score += 25;
    reasons.push({
      code: "single_pitch_brigade",
      weight: 25,
      detail: `${singlePitchVoters.length} one-and-done voters piled onto this pitch`,
    });
  } else if (thisIsSingle && peerVotes.length >= 8) {
    // Weaker signal when we couldn't label peers but pitch is hot and voter is new
    score += 10;
    reasons.push({
      code: "new_single_pitch_voter",
      weight: 10,
      detail: "First/only vote from this email on a high-activity pitch",
    });
  }

  // --- Self-vote heuristics ---
  const owner = normalizeEmail(ownerEmail);
  if (owner && (owner === voterEmail || canonicalizeEmail(owner) === canon)) {
    score += 50;
    reasons.push({
      code: "self_vote",
      weight: 50,
      detail: "Voter email matches pitch owner account",
    });
  } else if (pitchSubmitterName) {
    const affinity = nameEmailAffinity(pitchSubmitterName, voterEmail);
    if (affinity >= 2) {
      score += 35;
      reasons.push({
        code: "self_vote_name_affinity",
        weight: 35,
        detail: `Voter email closely matches submitter name (${pitchSubmitterName})`,
      });
    }
  }

  // --- Rare domain cluster on one pitch ---
  const domain = emailDomain(voterEmail);
  if (domain && !COMMON_DOMAINS.has(domain) && !TEMP_DOMAINS.has(domain)) {
    const sameDomain = peerVotes.filter(
      (v) => emailDomain(v.voter_email || v.voter_key) === domain
    );
    if (sameDomain.length >= DOMAIN_CLUSTER_MIN) {
      score += 25;
      reasons.push({
        code: "rare_domain_cluster",
        weight: 25,
        detail: `${sameDomain.length} votes from ${domain} on this pitch`,
      });
    }
  }

  return {
    score: Math.min(100, score),
    reasons,
  };
}

export function statusAfterScore(score, previousStatus) {
  if (previousStatus === VOTE_RISK_STATUS.DISMISSED) {
    return VOTE_RISK_STATUS.DISMISSED;
  }
  if (score >= RISK_REVIEW_THRESHOLD) return VOTE_RISK_STATUS.REVIEW;
  return VOTE_RISK_STATUS.CLEAR;
}

/**
 * Load context, score one vote, persist risk fields.
 * Returns null if risk columns aren't migrated yet.
 */
export async function scoreAndPersistVote(supabase, voteId) {
  const { data: vote, error: voteErr } = await supabase
    .from("pitch_votes")
    .select(
      "id, pitch_id, voter_email, voter_key, voter_name, created_at, vote_risk_status"
    )
    .eq("id", voteId)
    .maybeSingle();

  if (voteErr) {
    if (isMissingRiskColumn(voteErr)) {
      // Pre-migration: try without risk column
      const fallback = await supabase
        .from("pitch_votes")
        .select("id, pitch_id, voter_email, voter_key, voter_name, created_at")
        .eq("id", voteId)
        .maybeSingle();
      if (fallback.error || !fallback.data) return null;
      return scoreAndPersistVoteWithRow(supabase, {
        ...fallback.data,
        vote_risk_status: VOTE_RISK_STATUS.CLEAR,
      });
    }
    throw voteErr;
  }
  if (!vote) return null;
  return scoreAndPersistVoteWithRow(supabase, vote);
}

async function scoreAndPersistVoteWithRow(supabase, vote) {
  const voterKey = vote.voter_key || normalizeEmail(vote.voter_email);

  const [peerRes, voterRes, pitchRes, settingsRes] = await Promise.all([
    supabase
      .from("pitch_votes")
      .select("id, pitch_id, voter_email, voter_key, created_at")
      .eq("pitch_id", vote.pitch_id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("pitch_votes")
      .select("id, pitch_id, voter_email, voter_key, created_at")
      .eq("voter_key", voterKey)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("pitches")
      .select("id, name, user_id")
      .eq("id", vote.pitch_id)
      .maybeSingle(),
    supabase
      .from("competition_settings")
      .select("max_votes_per_user")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const maxVotesPerUser = settingsRes?.data?.max_votes_per_user || 5;
  const peers = peerRes?.data || [];
  const mine = voterRes?.data || [];
  const pitch = pitchRes?.data || null;

  // Enrich peers: which voter_keys only appear on this pitch?
  const peerKeys = [...new Set(peers.map((p) => p.voter_key || normalizeEmail(p.voter_email)).filter(Boolean))];
  let singleKeySet = new Set();
  if (peerKeys.length) {
    const { data: allByKeys } = await supabase
      .from("pitch_votes")
      .select("voter_key, pitch_id")
      .in("voter_key", peerKeys.slice(0, 100));
    const counts = new Map();
    for (const row of allByKeys || []) {
      const k = row.voter_key;
      if (!counts.has(k)) counts.set(k, new Set());
      counts.get(k).add(row.pitch_id);
    }
    for (const [k, pitches] of counts) {
      if (pitches.size === 1 && pitches.has(vote.pitch_id)) singleKeySet.add(k);
    }
  }

  const enrichedPeers = peers.map((p) => ({
    ...p,
    _onlyVoteOnThisPitch: singleKeySet.has(
      p.voter_key || normalizeEmail(p.voter_email)
    ),
  }));

  let ownerEmail = null;
  if (pitch?.user_id) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(
        pitch.user_id
      );
      ownerEmail = authUser?.user?.email || null;
    } catch {
      // Non-fatal — fall back to name affinity only.
    }
  }

  const { score, reasons } = computeVoteRisk({
    vote,
    peerVotes: enrichedPeers,
    voterVotes: mine,
    ownerEmail,
    pitchSubmitterName: pitch?.name || null,
    maxVotesPerUser,
  });

  const nextStatus = statusAfterScore(score, vote.vote_risk_status);

  const { error: updateErr } = await supabase
    .from("pitch_votes")
    .update({
      vote_risk_score: score,
      vote_risk_reasons: reasons,
      vote_risk_status: nextStatus,
      vote_risk_scored_at: new Date().toISOString(),
    })
    .eq("id", vote.id);

  if (updateErr) {
    if (isMissingRiskColumn(updateErr)) return { skipped: true, score, reasons };
    throw updateErr;
  }

  return { id: vote.id, score, reasons, status: nextStatus };
}

/**
 * Rescore a batch of recent / unscored votes (cron + admin refresh).
 */
export async function rescoreRecentVotes(supabase, { limit = 100 } = {}) {
  // Prefer rows never scored, then oldest scored (so signals can refresh).
  let rows = [];
  const unscored = await supabase
    .from("pitch_votes")
    .select("id")
    .is("vote_risk_scored_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unscored.error && isMissingRiskColumn(unscored.error)) {
    return { processed: 0, skipped: true, error: "vote risk columns not migrated" };
  }
  if (unscored.error) throw unscored.error;
  rows = unscored.data || [];

  if (rows.length < limit) {
    const rest = await supabase
      .from("pitch_votes")
      .select("id")
      .not("vote_risk_scored_at", "is", null)
      .order("vote_risk_scored_at", { ascending: true })
      .limit(limit - rows.length);
    if (!rest.error && rest.data?.length) {
      rows = rows.concat(rest.data);
    }
  }

  let processed = 0;
  let flagged = 0;
  const errors = [];
  for (const row of rows) {
    try {
      const result = await scoreAndPersistVote(supabase, row.id);
      if (result && !result.skipped) {
        processed += 1;
        if (result.status === VOTE_RISK_STATUS.REVIEW) flagged += 1;
      }
    } catch (err) {
      errors.push({ id: row.id, error: err.message });
    }
  }

  return { processed, flagged, errors: errors.slice(0, 10), total: rows.length };
}
