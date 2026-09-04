// Vote-integrity scoring for the open gallery ballot.
//
// WHY THIS EXISTS
// The gallery is deliberately public: anyone, anywhere, can vote with a
// self-declared name and email (app/api/gallery/votes/route.js). Keeping
// it that way is a product decision, so we can't authenticate our way out
// of vote stuffing — the best we can do is make a second, third, tenth
// identity *look* like what it is, and put that in front of a human.
//
// WHAT THIS IS NOT
// It is not an adjudicator. Every function here produces a score and the
// evidence behind it; nothing in this file deletes a vote or changes a
// tally. Every signal below has an innocent explanation — roommates on one
// router, a lecture hall behind one NAT, two real people named John Smith,
// a pitch that got shared in a group chat and drew a genuine burst. The
// output is a lead for review, and the thresholds are tuned to keep
// obvious-looking rings above the fold rather than to catch everything.
//
// The whole module is pure: it takes rows in and returns findings out, so
// the scoring can be tested without a database (see
// __tests__/vote-integrity.test.js).

// ─── Tunables ─────────────────────────────────────────────────────────
// Each signal contributes its weight once per cluster. Scores are capped
// at 100. These numbers are deliberately arranged so that no *single*
// weak signal clears MIN_SCORE on its own — a flag needs corroboration.
export const SIGNAL_WEIGHTS = Object.freeze({
  shared_ip:          30,  // same exact address behind several identities
  shared_subnet_ua:   22,  // same /24 + same browser build
  plus_alias:         40,  // addresses that are provably one mailbox
  email_stem:         32,  // addresses that probably collapse to one inbox
  pitch_burst:        38,  // a wave of brand-new identities onto one pitch
  sequential_locals:  20,  // foo1@, foo2@, foo3@
  name_reuse:         16,  // one display name, several addresses
  disposable_domain:  18,  // mailinator & friends
  self_vote:          25,  // voter is the submitter or a teammate
  single_target:      15,  // the cluster piled onto one pitch
  burst:              15,  // several identities within minutes
  identical_ballots:  12,  // two identities, exactly the same ballot
  single_purpose:     10,  // every identity voted exactly once, ever
  regular_cadence:    10,  // machine-like spacing between votes
});

// A cluster spread thinly across many pitches looks like a shared network
// (campus wifi, a household, an office), not a ring. Pull its score down.
//
// It does NOT apply to a cluster held together by a provable shared
// mailbox. Dispersion is evidence that an anchor was circumstantial, and
// sub-addressing is never circumstantial — mziaulh+mark@ and
// mziaulh+omair@ are one person whether they pile onto one pitch or
// spread themselves politely across nine. Applying the penalty there cost
// a real cluster 51 points and is why the first incident, spread out,
// would have scored 49 instead of 100.
export const DISPERSION_PENALTY = 18;

// A submitter voting for their own pitch is a one-identity finding, so it
// can't come out of the clustering pass (which needs two identities to
// have anything to compare). It gets its own detector and its own base
// score — high enough to land in the queue on its own, low enough that
// it reads as "look at this", not "fraud".
export const SELF_VOTE_BASE = 45;

export const MIN_SCORE = 25;          // below this we don't persist a flag
export const HIGH_SCORE = 60;
export const MEDIUM_SCORE = 35;

export const BURST_WINDOW_MS = 10 * 60_000;
export const MIN_STEM_LENGTH = 3;     // shorter stems are too generic
export const MIN_NAME_LENGTH = 4;
export const MAX_CLUSTER_MEMBERS = 60; // truncate pathological groups
export const CADENCE_VARIATION = 0.25;
// Even spacing only means anything at machine speed. Honest voters who
// happen to open the gallery at a similar hour each evening produce a
// beautifully regular cadence and are not bots, so cap what counts.
export const CADENCE_MAX_MEAN_MS = 5 * 60_000;
// A "ballot" of one pitch matching another ballot of one pitch is not
// evidence of anything — with five votes each, plenty of honest people
// spend exactly one. Only real, multi-pitch ballots can be twins.
export const MIN_BALLOT_SIZE_FOR_TWINS = 2;

// ─── Pitch velocity ───────────────────────────────────────────────────
// The clustering pass can only see a ring through a shared anchor: an
// inbox, an address, a browser, a name. Vary all four — twelve unrelated
// gmails, twelve different names, a VPN — and twelve votes landing on one
// pitch inside eight minutes produce no cluster at all. That hole was
// found by replaying the incident with the anchors stripped out: zero
// findings.
//
// So velocity is its own detector, anchored on the pitch and the clock
// rather than on anything the voter controls.
//
// The discriminator against an honest spike — a pitch shared to a group
// chat, a class told to go vote — is SINGLE PURPOSE. Real people who
// arrive at the gallery generally spend more than one of their five
// votes; manufactured identities spend exactly one, on the pitch they
// were made for, and are never seen again. A window full of voters who
// have voted for something else is not a burst worth reporting, and the
// gate below is what keeps that case out of the queue entirely.
export const PITCH_BURST_WINDOW_MS = 15 * 60_000;
export const PITCH_BURST_MIN_VOTERS = 6;
export const PITCH_BURST_SINGLE_PURPOSE_SHARE = 0.8;

// Not exhaustive and never will be — a maintained blocklist is a losing
// game. It's here because a hit is a strong hint, not because a miss
// means anything.
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "yopmail.com", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "throwawaymail.com", "trashmail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "mintemail.com", "spamgourmet.com", "mohmal.com",
  "emailondeck.com", "moakt.com", "tempr.email", "grr.la",
]);

// Providers where dots in the local part are cosmetic — a.b@gmail.com and
// ab@gmail.com are one inbox, so collapsing them is fact, not inference.
const DOT_INSENSITIVE = new Set(["gmail.com", "googlemail.com"]);

// ─── Normalization ────────────────────────────────────────────────────

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * The mailbox an address provably belongs to.
 *
 *   mziaulh+mark@umich.edu  -> mziaulh@umich.edu
 *   j.smith+vote3@gmail.com -> jsmith@gmail.com
 *
 * Deliberately narrower than emailIdentity().stem below: this strips only
 * things that cannot change where mail is delivered — the sub-address
 * label after "+", and dots on Google-hosted consumer mail. It does NOT
 * strip trailing digits, because mark1@ and mark2@ really might be two
 * people and this value is load-bearing: the ballot enforces one vote
 * budget per canonical inbox, so a wrong collapse here silently eats a
 * real person's vote.
 *
 * Mirrored in SQL as public.vote_canonical_inbox() — change both.
 */
export function canonicalInbox(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;

  let local = normalized.slice(0, at).split("+")[0];
  let domain = normalized.slice(at + 1);

  if (DOT_INSENSITIVE.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }

  return local ? `${local}@${domain}` : normalized;
}

/**
 * Collapse an address to the inbox it probably belongs to.
 *   j.smith+vote3@gmail.com -> { stem: "jsmith", domain: "gmail.com" }
 *   jsmith2024@umich.edu    -> { stem: "jsmith", domain: "umich.edu" }
 * Returns null when there's nothing meaningful left to group on.
 */
export function emailIdentity(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);

  // Sub-addressing: everything after "+" is the user's own label.
  local = local.split("+")[0];

  if (DOT_INSENSITIVE.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com"; // googlemail is an alias of the same mailbox
  }

  const localClean = local.replace(/[._-]/g, "");
  // Trailing digits are how a second identity is usually made. This also
  // collapses genuinely different people (mark1 / mark2), which is exactly
  // why email_stem alone doesn't clear MIN_SCORE.
  const stem = localClean.replace(/\d+$/, "");

  return {
    local,
    localClean,
    domain,
    stem: stem.length >= MIN_STEM_LENGTH ? stem : null,
    inbox: canonicalInbox(normalized),
    disposable: DISPOSABLE_DOMAINS.has(domain),
  };
}

/** Fold a display name for comparison: case, punctuation, extra spaces. */
export function nameKey(name) {
  const key = String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length >= MIN_NAME_LENGTH ? key : null;
}

/** Submitter-side identities for a pitch, used to catch self-voting. */
export function submitterIdentities(pitch) {
  const uniqnames = [
    pitch?.uniqname,
    ...(Array.isArray(pitch?.teammate_uniqnames) ? pitch.teammate_uniqnames : []),
  ];
  const out = new Set();
  for (const raw of uniqnames) {
    const u = String(raw || "").trim().toLowerCase();
    if (!u) continue;
    out.add(u.includes("@") ? u : `${u}@umich.edu`);
  }
  return out;
}

// ─── Analysis ─────────────────────────────────────────────────────────

function shortHash(hash) {
  return hash ? String(hash).slice(-6) : "unknown";
}

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function prepareVote(vote) {
  const voterKey = normalizeEmail(vote?.voter_key || vote?.voter_email);
  if (!voterKey || !vote?.pitch_id) return null;
  const identity = emailIdentity(voterKey);
  const at = vote.created_at ? new Date(vote.created_at).getTime() : NaN;
  return {
    id: vote.id,
    pitchId: vote.pitch_id,
    pitchTitle: vote.pitch_title || null,
    voterKey,
    voterName: vote.voter_name || null,
    nameKey: nameKey(vote.voter_name),
    at: Number.isFinite(at) ? at : null,
    createdAt: vote.created_at || null,
    ipHash: vote.ip_hash || null,
    ipPrefixHash: vote.ip_prefix_hash || null,
    uaHash: vote.user_agent_hash || null,
    country: vote.geo_country || null,
    city: vote.geo_city || null,
    identity,
  };
}

function tally(items) {
  const counts = new Map();
  for (const item of items) {
    if (item === null || item === undefined) continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Score one candidate cluster — a set of votes sharing an anchor.
 * Returns null if fewer than two distinct identities are involved, since
 * one person voting once from one address is just... voting.
 */
function scoreCluster(group, ctx) {
  const votes = group.votes.slice(0, MAX_CLUSTER_MEMBERS * 4);
  const voterKeys = [...new Set(votes.map((v) => v.voterKey))].slice(0, MAX_CLUSTER_MEMBERS);
  if (voterKeys.length < 2) return null;

  const voterSet = new Set(voterKeys);
  const members = votes.filter((v) => voterSet.has(v.voterKey));
  const signals = [];
  let provableIdentity = false;
  const add = (code, detail) =>
    signals.push({ code, weight: SIGNAL_WEIGHTS[code], detail });

  // ── The anchor itself is the first signal.
  if (group.type === "ip") {
    add("shared_ip", `${voterKeys.length} identities voted from one address (note: a shared campus or household network looks like this too)`);
  } else if (group.type === "subnet_ua") {
    add("shared_subnet_ua", `${voterKeys.length} identities share a /24 subnet and an identical browser build`);
  } else if (group.type === "stem") {
    // Split the provable case out of the probable one. Addresses that
    // differ only by a +tag or by gmail dots are the SAME MAILBOX — that
    // is how mail delivery works, not an inference — so they earn a
    // heavier signal and immunity from the dispersion penalty below.
    // Trailing-digit variants (mark1@, mark2@) stay the weaker signal
    // they always were, because they really might be two people.
    const inboxes = new Map();
    for (const key of voterKeys) {
      const inbox = canonicalInbox(key);
      if (!inbox) continue;
      if (!inboxes.has(inbox)) inboxes.set(inbox, []);
      inboxes.get(inbox).push(key);
    }
    const aliased = [...inboxes.entries()].filter(([, keys]) => keys.length >= 2);
    if (aliased.length > 0) {
      provableIdentity = true;
      const [inbox, keys] = aliased.sort((a, b) => b[1].length - a[1].length)[0];
      const shown = keys.slice(0, 6).join(", ");
      add(
        "plus_alias",
        `${keys.length} addresses that are the same mailbox (${inbox}) — sub-address tags and dots do not change where mail is delivered: ${shown}${keys.length > 6 ? ", …" : ""}`
      );
    } else {
      add("email_stem", `${voterKeys.length} addresses collapse to "${group.anchor}" once dots, +tags and trailing digits are removed`);
    }
  } else if (group.type === "name") {
    add("name_reuse", `the name "${group.anchor}" was used with ${voterKeys.length} different addresses`);
  } else if (group.type === "pitch_burst") {
    add(
      "pitch_burst",
      `${voterKeys.length} identities voted for "${group.anchor}" within ${Math.round(PITCH_BURST_WINDOW_MS / 60_000)} minutes, and almost none of them have voted for anything else`
    );
  }

  // ── Target concentration.
  const pitchCounts = tally(members.map((v) => v.pitchId));
  const [topPitchId, topPitchVotes] = pitchCounts[0] || [null, 0];
  const topShare = members.length > 0 ? topPitchVotes / members.length : 0;
  const distinctPitches = pitchCounts.length;
  // `provableIdentity` is decided in the anchor block below, which runs
  // after this one, so the gate is applied at scoring time rather than here.
  const dispersedShape = distinctPitches >= 4 && topShare < 0.4;

  if (topShare >= 0.8 && members.length >= 2 && topPitchId) {
    const title = ctx.pitchTitle(topPitchId);
    add("single_target", `${topPitchVotes} of ${members.length} votes went to a single pitch (${title})`);
  }

  // ── Sequential local parts: foo1@, foo2@, foo3@.
  const byStemDomain = new Map();
  for (const key of voterKeys) {
    const id = emailIdentity(key);
    if (!id?.stem) continue;
    const match = id.localClean.match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const bucket = `${match[1]}@${id.domain}`;
    if (!byStemDomain.has(bucket)) byStemDomain.set(bucket, new Set());
    byStemDomain.get(bucket).add(match[2]);
  }
  for (const [bucket, numbers] of byStemDomain) {
    if (numbers.size >= 3) {
      add("sequential_locals", `numbered variants of ${bucket}: ${[...numbers].sort().join(", ")}`);
      break;
    }
  }

  // ── Disposable domains.
  const disposable = voterKeys.filter((k) => emailIdentity(k)?.disposable);
  if (disposable.length > 0) {
    add("disposable_domain", `${disposable.length} address(es) on a throwaway-mail provider`);
  }

  // ── Self-voting: a submitter or teammate voting for their own pitch.
  const selfVotes = members.filter((v) => {
    const owners = ctx.submitters.get(v.pitchId);
    if (!owners) return false;
    if (owners.has(v.voterKey)) return true;
    const stem = emailIdentity(v.voterKey)?.stem;
    return stem ? [...owners].some((o) => emailIdentity(o)?.stem === stem) : false;
  });
  if (selfVotes.length > 0) {
    add("self_vote", `${selfVotes.length} vote(s) cast by the pitch's own submitter or a listed teammate`);
  }

  // ── Timing.
  const times = members.map((v) => v.at).filter((t) => t !== null).sort((a, b) => a - b);
  if (times.length >= 3 && times[times.length - 1] - times[0] <= BURST_WINDOW_MS) {
    const spanMin = Math.round(((times[times.length - 1] - times[0]) / 60_000) * 10) / 10;
    add("burst", `${times.length} votes cast within ${spanMin} minute(s)`);
  }
  if (times.length >= 4) {
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (mean > 0 && mean <= CADENCE_MAX_MEAN_MS && stddev(gaps) / mean < CADENCE_VARIATION) {
      add("regular_cadence", `votes arrived at near-identical intervals (~${Math.round(mean / 1000)}s apart)`);
    }
  }

  // ── Ballot shape, judged against each identity's *entire* history, not
  // just the votes inside this cluster.
  const ballots = new Map();
  for (const key of voterKeys) {
    const all = ctx.byVoter.get(key);
    if (!all || all.pitchIds.size < MIN_BALLOT_SIZE_FOR_TWINS) continue;
    const shape = [...all.pitchIds].sort().join("|");
    ballots.set(shape, (ballots.get(shape) || 0) + 1);
  }
  const twins = [...ballots.values()].filter((n) => n >= 2).length;
  if (twins > 0) {
    add("identical_ballots", `two or more identities cast exactly the same multi-pitch ballot`);
  }

  const totals = voterKeys.map((k) => ctx.byVoter.get(k)?.votes.length || 0);
  if (voterKeys.length >= 3 && totals.every((n) => n === 1)) {
    add("single_purpose", `every identity in this group has cast exactly one vote, ever`);
  }

  // ── Total.
  let score = signals.reduce((sum, s) => sum + s.weight, 0);
  // A spread-out cluster reads as a shared network — unless the thing
  // holding it together is one mailbox, which no amount of spreading can
  // explain away.
  const dispersed = dispersedShape && !provableIdentity;
  if (dispersed) {
    // Looks like a shared network rather than a ring.
    score -= DISPERSION_PENALTY;
    signals.push({
      code: "dispersed",
      weight: -DISPERSION_PENALTY,
      detail: `votes are spread across ${distinctPitches} pitches with no clear favourite — consistent with a shared network`,
    });
  } else if (voterKeys.length > 2) {
    // More identities behind one anchor is worse, but only when they are
    // actually pulling in the same direction.
    const escalation = Math.min((voterKeys.length - 2) * 4, 20);
    score += escalation;
    signals.push({
      code: "group_size",
      weight: escalation,
      detail: `${voterKeys.length} identities share this anchor`,
    });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const severity = score >= HIGH_SCORE ? "high" : score >= MEDIUM_SCORE ? "medium" : "low";

  return {
    clusterKey: `${group.type}:${group.anchorKey}`,
    clusterType: group.type,
    anchorLabel: group.label,
    pitchId: topShare >= 0.5 ? topPitchId : null,
    score,
    severity,
    signals,
    voterKeys,
    voteIds: members.map((v) => v.id).filter(Boolean),
    voterCount: voterKeys.length,
    voteCount: members.length,
    evidence: {
      pitches: pitchCounts.slice(0, 8).map(([id, count]) => ({
        id,
        title: ctx.pitchTitle(id),
        votes: count,
      })),
      names: tally(members.map((v) => v.voterName)).slice(0, 6).map(([name, count]) => ({ name, count })),
      domains: tally(voterKeys.map((k) => emailIdentity(k)?.domain)).slice(0, 6).map(([domain, count]) => ({ domain, count })),
      countries: tally(members.map((v) => v.country)).slice(0, 4).map(([code, count]) => ({ code, count })),
      window: times.length
        ? {
            first: new Date(times[0]).toISOString(),
            last: new Date(times[times.length - 1]).toISOString(),
            spanMinutes: Math.round(((times[times.length - 1] - times[0]) / 60_000) * 10) / 10,
          }
        : null,
    },
  };
}

/**
 * Run every detector over a set of votes.
 *
 * @param {Array<object>} votes   rows from pitch_votes (see prepareVote for
 *                                the fields that matter; all fingerprint
 *                                fields are optional)
 * @param {object}   [options]
 * @param {Array}    [options.pitches]  [{ id, title, uniqname, teammate_uniqnames }]
 * @param {number}   [options.minScore] flags below this are dropped
 * @returns {{clusters:Array, pitchRisk:Array, stats:object}}
 */
export function analyzeVotes(votes, options = {}) {
  const { pitches = [], minScore = MIN_SCORE } = options;

  const rows = (votes || []).map(prepareVote).filter(Boolean);

  // Per-identity index over the *whole* window — ballot-shape and
  // single-purpose signals are meaningless scoped to one cluster.
  const byVoter = new Map();
  for (const row of rows) {
    if (!byVoter.has(row.voterKey)) {
      byVoter.set(row.voterKey, { votes: [], pitchIds: new Set() });
    }
    const entry = byVoter.get(row.voterKey);
    entry.votes.push(row);
    entry.pitchIds.add(row.pitchId);
  }

  const pitchIndex = new Map();
  const submitters = new Map();
  for (const pitch of pitches) {
    if (!pitch?.id) continue;
    pitchIndex.set(pitch.id, pitch);
    submitters.set(pitch.id, submitterIdentities(pitch));
  }
  const pitchTitle = (id) =>
    pitchIndex.get(id)?.title ||
    rows.find((r) => r.pitchId === id)?.pitchTitle ||
    "Untitled pitch";

  // ── Bucket every vote under each anchor it belongs to.
  const groups = new Map();
  const bucket = (type, anchorKey, anchor, label, row) => {
    const key = `${type}:${anchorKey}`;
    if (!groups.has(key)) {
      groups.set(key, { type, anchorKey, anchor, label, votes: [] });
    }
    groups.get(key).votes.push(row);
  };

  for (const row of rows) {
    if (row.identity?.stem) {
      const anchor = `${row.identity.stem}@${row.identity.domain}`;
      bucket("stem", anchor, anchor, anchor, row);
    }
    if (row.ipHash) {
      bucket("ip", row.ipHash, row.ipHash, `address ····${shortHash(row.ipHash)}`, row);
    }
    if (row.ipPrefixHash && row.uaHash) {
      const anchor = `${row.ipPrefixHash}:${row.uaHash}`;
      bucket(
        "subnet_ua",
        anchor,
        anchor,
        `subnet ····${shortHash(row.ipPrefixHash)} + browser ····${shortHash(row.uaHash)}`,
        row
      );
    }
    if (row.nameKey) {
      bucket("name", row.nameKey, row.nameKey, `"${row.voterName || row.nameKey}"`, row);
    }
  }

  const ctx = { byVoter, submitters, pitchTitle };
  const clusters = [];
  for (const group of groups.values()) {
    const cluster = scoreCluster(group, ctx);
    if (cluster && cluster.score >= minScore) clusters.push(cluster);
  }

  // Self-voting is checked per pitch rather than per cluster: one person
  // voting for their own pitch involves exactly one identity, so the
  // clustering pass above would never see it.
  const selfByPitch = new Map();
  for (const row of rows) {
    const owners = submitters.get(row.pitchId);
    if (!owners || owners.size === 0) continue;
    const stem = row.identity?.stem;
    const isOwner =
      owners.has(row.voterKey) ||
      (stem ? [...owners].some((o) => emailIdentity(o)?.stem === stem) : false);
    if (!isOwner) continue;
    if (!selfByPitch.has(row.pitchId)) selfByPitch.set(row.pitchId, []);
    selfByPitch.get(row.pitchId).push(row);
  }

  for (const [pitchId, selfVotes] of selfByPitch) {
    const voterKeys = [...new Set(selfVotes.map((v) => v.voterKey))];
    const score = Math.min(100, SELF_VOTE_BASE + (selfVotes.length - 1) * 5);
    if (score < minScore) continue;
    const title = pitchTitle(pitchId);
    clusters.push({
      clusterKey: `self:${pitchId}`,
      clusterType: "self",
      anchorLabel: title,
      pitchId,
      score,
      severity: score >= HIGH_SCORE ? "high" : score >= MEDIUM_SCORE ? "medium" : "low",
      signals: [
        {
          code: "self_vote",
          weight: score,
          detail: `${selfVotes.length} vote(s) on "${title}" came from the submitter or a listed teammate (${voterKeys.join(", ")})`,
        },
      ],
      voterKeys,
      voteIds: selfVotes.map((v) => v.id).filter(Boolean),
      voterCount: voterKeys.length,
      voteCount: selfVotes.length,
      evidence: {
        pitches: [{ id: pitchId, title, votes: selfVotes.length }],
        names: tally(selfVotes.map((v) => v.voterName)).slice(0, 4).map(([name, count]) => ({ name, count })),
        domains: tally(voterKeys.map((k) => emailIdentity(k)?.domain)).slice(0, 4).map(([domain, count]) => ({ domain, count })),
        countries: [],
        window: null,
      },
    });
  }

  // ── Pitch velocity: a wave with no shared anchor at all.
  //
  // Everything above needs two identities to have something in common.
  // This pass needs only a pitch and a clock, so it is the one detector
  // that still works when the attacker varies the inbox, the address, the
  // browser and the name.
  const alreadyFlagged = new Set();
  for (const cluster of clusters) {
    for (const key of cluster.voterKeys) alreadyFlagged.add(`${cluster.pitchId || ""}|${key}`);
  }

  const rowsByPitch = new Map();
  for (const row of rows) {
    if (row.at === null) continue;
    if (!rowsByPitch.has(row.pitchId)) rowsByPitch.set(row.pitchId, []);
    rowsByPitch.get(row.pitchId).push(row);
  }

  for (const [pitchId, pitchRows] of rowsByPitch) {
    const sorted = [...pitchRows].sort((a, b) => a.at - b.at);
    // Widest window with the most distinct identities in it.
    let best = null;
    let left = 0;
    for (let right = 0; right < sorted.length; right += 1) {
      while (sorted[right].at - sorted[left].at > PITCH_BURST_WINDOW_MS) left += 1;
      const slice = sorted.slice(left, right + 1);
      const distinct = new Set(slice.map((v) => v.voterKey)).size;
      if (!best || distinct > best.distinct) best = { slice, distinct };
    }
    if (!best || best.distinct < PITCH_BURST_MIN_VOTERS) continue;

    // The gate. An honest spike is made of people who went on to spend
    // their other votes; a manufactured one is made of identities that
    // exist for exactly one vote. Without this check a pitch shared to a
    // group chat would land in the queue every time, and a queue that
    // cries wolf is the same as no queue at all.
    const windowVoters = [...new Set(best.slice.map((v) => v.voterKey))];
    const singlePurpose = windowVoters.filter(
      (key) => (byVoter.get(key)?.votes.length || 0) === 1
    ).length;
    if (singlePurpose / windowVoters.length < PITCH_BURST_SINGLE_PURPOSE_SHARE) continue;

    // Don't re-report a ring the clustering pass already caught.
    const novel = windowVoters.filter((key) => !alreadyFlagged.has(`${pitchId}|${key}`));
    if (novel.length / windowVoters.length < 0.5) continue;

    const title = pitchTitle(pitchId);
    const cluster = scoreCluster(
      { type: "pitch_burst", anchorKey: pitchId, anchor: title, label: title, votes: best.slice },
      ctx
    );
    if (cluster && cluster.score >= minScore) {
      cluster.pitchId = pitchId;
      clusters.push(cluster);
    }
  }

  clusters.sort((a, b) => b.score - a.score || b.voterCount - a.voterCount);

  // ── Roll clusters up per pitch, so the admin can answer the question
  // that actually matters: "is this pitch's tally trustworthy?"
  const votesPerPitch = new Map();
  for (const row of rows) {
    votesPerPitch.set(row.pitchId, (votesPerPitch.get(row.pitchId) || 0) + 1);
  }
  const flaggedPerPitch = new Map();
  for (const cluster of clusters) {
    for (const [pitchId, count] of cluster.evidence.pitches.map((p) => [p.id, p.votes])) {
      const entry = flaggedPerPitch.get(pitchId) || { votes: 0, maxScore: 0, clusters: 0 };
      entry.votes += count;
      entry.clusters += 1;
      entry.maxScore = Math.max(entry.maxScore, cluster.score);
      flaggedPerPitch.set(pitchId, entry);
    }
  }
  const pitchRisk = [...flaggedPerPitch.entries()]
    .map(([pitchId, entry]) => {
      const total = votesPerPitch.get(pitchId) || 0;
      // Clusters overlap (one vote can be flagged by both its IP and its
      // email stem), so cap the count at the pitch's real total rather
      // than reporting more suspect votes than votes.
      const suspect = Math.min(entry.votes, total);
      return {
        pitchId,
        title: pitchTitle(pitchId),
        totalVotes: total,
        suspectVotes: suspect,
        suspectShare: total > 0 ? Math.round((suspect / total) * 100) / 100 : 0,
        maxScore: entry.maxScore,
        clusters: entry.clusters,
      };
    })
    .sort((a, b) => b.maxScore - a.maxScore || b.suspectShare - a.suspectShare);

  return {
    clusters,
    pitchRisk,
    stats: {
      votesAnalyzed: rows.length,
      distinctVoters: byVoter.size,
      clustersFound: clusters.length,
      high: clusters.filter((c) => c.severity === "high").length,
      medium: clusters.filter((c) => c.severity === "medium").length,
      low: clusters.filter((c) => c.severity === "low").length,
      withFingerprint: rows.filter((r) => r.ipHash).length,
    },
  };
}
