import { test } from "node:test";
import assert from "node:assert/strict";

const {
  analyzeVotes,
  emailIdentity,
  nameKey,
  submitterIdentities,
  MEDIUM_SCORE,
  HIGH_SCORE,
} = await import("../lib/voteIntegrity.js");

// ── Helpers ─────────────────────────────────────────────────────────────
const T0 = Date.parse("2026-08-20T14:00:00.000Z");
let seq = 0;

function vote(overrides = {}) {
  seq += 1;
  return {
    id: `v${seq}`,
    pitch_id: "pitch-a",
    voter_key: `voter${seq}@example.com`,
    voter_name: `Voter ${seq}`,
    created_at: new Date(T0 + seq * 3_600_000).toISOString(),
    ip_hash: null,
    ip_prefix_hash: null,
    user_agent_hash: null,
    geo_country: null,
    ...overrides,
  };
}

const clusterOfType = (result, type) =>
  result.clusters.find((c) => c.clusterType === type);

// ── Normalization ───────────────────────────────────────────────────────

test("gmail addresses collapse to one inbox", () => {
  const a = emailIdentity("j.smith+vote3@gmail.com");
  const b = emailIdentity("jsmith@googlemail.com");
  assert.equal(a.stem, "jsmith");
  assert.equal(b.stem, "jsmith");
  assert.equal(a.domain, "gmail.com");
  assert.equal(b.domain, "gmail.com");
});

test("trailing digits are stripped from the stem", () => {
  assert.equal(emailIdentity("jsmith2024@umich.edu").stem, "jsmith");
  assert.equal(emailIdentity("jsmith@umich.edu").stem, "jsmith");
});

test("dots are only collapsed where the provider ignores them", () => {
  // umich treats a.b and ab as different mailboxes, so the *local* keeps
  // its shape even though the stem strips separators for comparison.
  const id = emailIdentity("a.b@umich.edu");
  assert.equal(id.local, "a.b");
  assert.equal(id.domain, "umich.edu");
});

test("stems too short to be meaningful are dropped", () => {
  assert.equal(emailIdentity("ab@umich.edu").stem, null);
  assert.equal(emailIdentity("not-an-email"), null);
});

test("throwaway providers are recognised", () => {
  assert.equal(emailIdentity("burner@mailinator.com").disposable, true);
  assert.equal(emailIdentity("real@umich.edu").disposable, false);
});

test("name keys fold case and punctuation, and reject short names", () => {
  assert.equal(nameKey("  John   O'Smith "), "john o smith");
  assert.equal(nameKey("Jo"), null);
});

test("submitter identities expand uniqnames to umich addresses", () => {
  const ids = submitterIdentities({
    uniqname: "jdoe",
    teammate_uniqnames: ["rroe", "mmoe@umich.edu"],
  });
  assert.deepEqual(
    [...ids].sort(),
    ["jdoe@umich.edu", "mmoe@umich.edu", "rroe@umich.edu"]
  );
});

// ── Detection: things that should flag ──────────────────────────────────

test("two addresses that collapse to one inbox, both on one pitch, flag", () => {
  const result = analyzeVotes([
    vote({ voter_key: "j.smith@gmail.com", voter_name: "J Smith" }),
    vote({ voter_key: "jsmith2@gmail.com", voter_name: "John S" }),
  ]);

  const cluster = clusterOfType(result, "stem");
  assert.ok(cluster, "expected a stem cluster");
  assert.ok(cluster.score >= MEDIUM_SCORE, `score was ${cluster.score}`);
  assert.equal(cluster.voterCount, 2);
  assert.equal(cluster.pitchId, "pitch-a");
  assert.ok(cluster.signals.some((s) => s.code === "email_stem"));
  assert.ok(cluster.signals.some((s) => s.code === "single_target"));
});

test("a ring behind one address piling onto one pitch scores high", () => {
  const votes = ["alpha", "bravo", "charlie", "delta", "echo"].map((name, i) =>
    vote({
      voter_key: `${name}@example.com`,
      voter_name: name,
      ip_hash: "sharedip",
      created_at: new Date(T0 + i * 40_000).toISOString(),
    })
  );

  const result = analyzeVotes(votes);
  const cluster = clusterOfType(result, "ip");

  assert.ok(cluster, "expected an ip cluster");
  assert.equal(cluster.severity, "high");
  assert.ok(cluster.score >= HIGH_SCORE);
  assert.equal(cluster.voterCount, 5);
  const codes = cluster.signals.map((s) => s.code);
  assert.ok(codes.includes("shared_ip"));
  assert.ok(codes.includes("burst"));
  assert.ok(codes.includes("single_target"));
  assert.ok(codes.includes("single_purpose"));
});

test("numbered address variants are called out", () => {
  const result = analyzeVotes(
    [1, 2, 3].map((n) => vote({ voter_key: `booster${n}@example.com` }))
  );
  const cluster = clusterOfType(result, "stem");
  assert.ok(cluster);
  assert.ok(cluster.signals.some((s) => s.code === "sequential_locals"));
  assert.equal(cluster.severity, "high");
});

test("a submitter voting for their own pitch is flagged on its own", () => {
  const result = analyzeVotes(
    [vote({ voter_key: "jdoe@umich.edu", voter_name: "J Doe" })],
    { pitches: [{ id: "pitch-a", title: "SolarDesk", uniqname: "jdoe" }] }
  );

  const cluster = clusterOfType(result, "self");
  assert.ok(cluster, "expected a self-vote cluster");
  assert.equal(cluster.pitchId, "pitch-a");
  assert.equal(cluster.voteCount, 1);
  assert.match(cluster.signals[0].detail, /SolarDesk/);
});

test("a teammate voting via a plus-tagged alias still counts as a self-vote", () => {
  const result = analyzeVotes(
    [vote({ voter_key: "rroe+vote@umich.edu" })],
    {
      pitches: [
        { id: "pitch-a", title: "SolarDesk", uniqname: "jdoe", teammate_uniqnames: ["rroe"] },
      ],
    }
  );
  assert.ok(clusterOfType(result, "self"));
});

// ── Restraint: things that should NOT flag ──────────────────────────────

test("a shared campus network voting widely is not treated as a ring", () => {
  // Eight people behind one NAT, each backing a different pitch, spread
  // over hours. This is what a lecture hall looks like.
  const people = [
    ["aparker", "Ava Parker"], ["bchen", "Ben Chen"], ["cnguyen", "Cara Nguyen"],
    ["dokafor", "Dami Okafor"], ["ereyes", "Elena Reyes"], ["fhaddad", "Faris Haddad"],
    ["gmurphy", "Grace Murphy"], ["hsato", "Hana Sato"],
  ];
  const votes = people.map(([uniqname, name], i) =>
    vote({
      pitch_id: `pitch-${i}`,
      voter_key: `${uniqname}@umich.edu`,
      voter_name: name,
      ip_hash: "campusnat",
      created_at: new Date(T0 + i * 5_400_000).toISOString(),
    })
  );

  const result = analyzeVotes(votes);
  assert.equal(clusterOfType(result, "ip"), undefined);
});

test("two real people with the same common name do not flag", () => {
  const result = analyzeVotes([
    vote({ pitch_id: "pitch-a", voter_key: "jsmith@umich.edu", voter_name: "John Smith" }),
    vote({ pitch_id: "pitch-b", voter_key: "johns@wayne.edu", voter_name: "John Smith" }),
  ]);
  assert.equal(result.clusters.length, 0);
});

test("ordinary voting produces no flags at all", () => {
  const people = [
    ["mliu", "Mei Liu"], ["jokonkwo", "Jide Okonkwo"], ["svasquez", "Sofia Vasquez"],
    ["tkaur", "Tara Kaur"], ["rbenali", "Rami Benali"], ["nkowalski", "Nina Kowalski"],
    ["dpatel", "Dev Patel"], ["lhoffman", "Lena Hoffman"], ["ymori", "Yuki Mori"],
    ["cadeyemi", "Chidi Adeyemi"], ["ekaplan", "Eli Kaplan"], ["ptran", "Phuong Tran"],
  ];
  const votes = people.map(([uniqname, name], i) =>
    vote({
      pitch_id: `pitch-${i % 5}`,
      voter_key: `${uniqname}@umich.edu`,
      voter_name: name,
      ip_hash: `ip-${i}`,
      created_at: new Date(T0 + i * 7_200_000).toISOString(),
    })
  );
  const result = analyzeVotes(votes);
  assert.equal(result.clusters.length, 0);
  assert.equal(result.stats.votesAnalyzed, 12);
  assert.equal(result.stats.distinctVoters, 12);
});

// ── Robustness ──────────────────────────────────────────────────────────

test("votes with no fingerprint are analysed without error", () => {
  const result = analyzeVotes([
    vote({ voter_key: "a.person@gmail.com" }),
    vote({ voter_key: "aperson1@gmail.com" }),
  ]);
  assert.ok(result.clusters.length >= 1);
  assert.equal(result.stats.withFingerprint, 0);
});

test("malformed rows are skipped rather than throwing", () => {
  const result = analyzeVotes([
    null,
    { id: "x" },                       // no voter, no pitch
    { id: "y", pitch_id: "pitch-a" },  // no voter
    vote(),
  ]);
  assert.equal(result.stats.votesAnalyzed, 1);
});

test("empty input is handled", () => {
  const result = analyzeVotes([]);
  assert.deepEqual(result.clusters, []);
  assert.deepEqual(result.pitchRisk, []);
  assert.equal(result.stats.votesAnalyzed, 0);
});

test("pitch risk never reports more suspect votes than votes cast", () => {
  // This ring trips several detectors at once, so the same votes appear in
  // more than one cluster — the rollup must not double-count them.
  const votes = ["one", "two", "three"].map((name, i) =>
    vote({
      voter_key: `ring${i + 1}@mailinator.com`,
      voter_name: "Same Person",
      ip_hash: "ring-ip",
      ip_prefix_hash: "ring-subnet",
      user_agent_hash: "ring-ua",
      created_at: new Date(T0 + i * 30_000).toISOString(),
    })
  );

  const result = analyzeVotes(votes);
  assert.ok(result.clusters.length > 1, "expected overlapping clusters");

  const risk = result.pitchRisk.find((r) => r.pitchId === "pitch-a");
  assert.ok(risk);
  assert.equal(risk.totalVotes, 3);
  assert.equal(risk.suspectVotes, 3);
  assert.equal(risk.suspectShare, 1);
});

test("cluster keys are stable as a cluster grows", () => {
  const base = [
    vote({ voter_key: "grow1@example.com", ip_hash: "grow-ip" }),
    vote({ voter_key: "grow2@example.com", ip_hash: "grow-ip" }),
  ];
  const before = clusterOfType(analyzeVotes(base), "ip");
  const after = clusterOfType(
    analyzeVotes([...base, vote({ voter_key: "grow3@example.com", ip_hash: "grow-ip" })]),
    "ip"
  );
  assert.equal(before.clusterKey, after.clusterKey);
  assert.ok(after.score > before.score, "a bigger ring should score higher");
});

// ── The 2026-09-04 incident, and the holes it exposed ────────────────────
//
// Twelve votes from mziaulh+mark@, mziaulh+omair@, mziaulh+braden@ … onto
// a pitch submitted by mziaulh, inside eight minutes, and the Integrity
// queue stayed empty. Replaying it showed the scoring was never the
// problem — but probing around it found two ways to walk straight past
// the detector, and those are what the next few tests pin down.

const ALIASES = [
  "mark", "omair", "braden", "ali", "rahat", "mahnoor",
  "shah", "judy", "edward", "kelvin", "phd", "285",
];

function aliasVotes({ pitchIds = ["pitch-a"], spacingMs = 45_000 } = {}) {
  return ALIASES.map((tag, i) => ({
    id: `alias-${i}`,
    pitch_id: pitchIds[i % pitchIds.length],
    voter_key: `mziaulh+${tag}@umich.edu`,
    voter_name: tag,
    created_at: new Date(T0 + i * spacingMs).toISOString(),
    ip_hash: null,
    ip_prefix_hash: null,
    user_agent_hash: null,
    geo_country: null,
  }));
}

test("canonicalInbox strips only what cannot change delivery", async () => {
  const { canonicalInbox } = await import("../lib/voteIntegrity.js");
  assert.equal(canonicalInbox("mziaulh+mark@umich.edu"), "mziaulh@umich.edu");
  assert.equal(canonicalInbox("J.Smith+x@GoogleMail.com"), "jsmith@gmail.com");
  assert.equal(canonicalInbox("  Mziaulh@UMICH.edu "), "mziaulh@umich.edu");
  // Trailing digits are NOT stripped here, unlike the scoring stem. This
  // value gates a real person's vote budget, so it may only collapse
  // addresses that provably share a mailbox.
  assert.equal(canonicalInbox("mark2@umich.edu"), "mark2@umich.edu");
  assert.equal(canonicalInbox("a.b@umich.edu"), "a.b@umich.edu");
  assert.equal(canonicalInbox("not-an-email"), null);
});

test("the incident: twelve aliases on the submitter's own pitch", () => {
  const result = analyzeVotes(aliasVotes(), {
    pitches: [{ id: "pitch-a", title: "Overturned", uniqname: "mziaulh" }],
  });

  const cluster = clusterOfType(result, "stem");
  assert.ok(cluster, "the mailbox cluster must be found");
  assert.equal(cluster.score, 100);
  assert.equal(cluster.severity, "high");

  const codes = cluster.signals.map((s) => s.code);
  assert.ok(codes.includes("plus_alias"), "sub-addressing is the headline signal");
  assert.ok(codes.includes("self_vote"));
  assert.ok(codes.includes("single_target"));

  // The self-vote detector reports it separately too, because a submitter
  // voting for their own pitch is worth seeing on its own terms.
  assert.ok(clusterOfType(result, "self"));
});

test("aliases stay high-severity when spread across many pitches", () => {
  // The original scoring applied the shared-network dispersion penalty to
  // mailbox clusters, so the same twelve identities scored 49 (medium)
  // once they stopped piling onto one pitch. Spreading out is not an
  // innocent explanation for one inbox holding twelve ballots.
  const result = analyzeVotes(
    aliasVotes({ pitchIds: ["pitch-a", "pitch-b", "pitch-c", "pitch-d", "pitch-e"] })
  );

  const cluster = clusterOfType(result, "stem");
  assert.ok(cluster);
  assert.ok(
    cluster.score >= HIGH_SCORE,
    `dispersed aliases should stay high severity, got ${cluster.score}`
  );
  assert.ok(!cluster.signals.some((s) => s.code === "dispersed"));
});

test("digit variants keep the weaker signal and the dispersion penalty", () => {
  // mark1@ and mark2@ might be two real people, so they must NOT get the
  // provable-mailbox treatment above.
  const votes = ["1", "2", "3", "4", "5", "6"].map((n, i) => ({
    id: `dig-${i}`,
    pitch_id: ["pitch-a", "pitch-b", "pitch-c", "pitch-d", "pitch-e"][i % 5],
    voter_key: `mark${n}@umich.edu`,
    voter_name: `Mark ${n}`,
    created_at: new Date(T0 + i * 3_600_000).toISOString(),
  }));

  const cluster = clusterOfType(analyzeVotes(votes), "stem");
  if (cluster) {
    const codes = cluster.signals.map((s) => s.code);
    assert.ok(!codes.includes("plus_alias"), "digits are not proof of one mailbox");
    assert.ok(codes.includes("dispersed"), "spread-out digit variants stay discounted");
  }
});

// ── Pitch velocity ───────────────────────────────────────────────────────

const REAL_NAMES = [
  ["Priya Raman", "praman"], ["Ben Okafor", "bokafor"], ["Chloe Tan", "ctan"],
  ["Diego Ruiz", "druiz"], ["Emma Novak", "enovak"], ["Farid Haddad", "fhaddad"],
  ["Grace Lin", "glin"], ["Hana Sato", "hsato"], ["Ivan Petrov", "ipetrov"],
  ["Julia Meyer", "jmeyer"], ["Kwame Asante", "kasante"], ["Lena Hoff", "lhoff"],
];

test("a wave with no shared anchor at all is still caught", () => {
  // Vary the inbox, the address, the name, and lose the fingerprint, and
  // the clustering pass has nothing to group on — this scenario returned
  // zero findings before the velocity detector existed.
  const votes = REAL_NAMES.map(([name, local], i) => ({
    id: `wave-${i}`,
    pitch_id: "pitch-a",
    voter_key: `${local}${2020 + i}@outlook.com`,
    voter_name: name,
    created_at: new Date(T0 + i * 47_000).toISOString(),
  }));

  const result = analyzeVotes(votes);
  const cluster = clusterOfType(result, "pitch_burst");
  assert.ok(cluster, "an anchorless burst must still surface");
  assert.ok(cluster.score >= HIGH_SCORE);
  assert.equal(cluster.pitchId, "pitch-a");
  assert.equal(cluster.voteIds.length, votes.length, "every vote in the wave is actionable");
});

test("a pitch shared to a group chat does not flag", () => {
  // The innocent twin of the test above: nine people arrive together
  // inside twelve minutes, but they behave like people — they spend more
  // than one of their five votes. That is the whole discriminator, and if
  // this test ever fails the queue has started crying wolf.
  const votes = [];
  REAL_NAMES.slice(0, 9).forEach(([name, local], p) => {
    const key = `${local}@gmail.com`;
    votes.push({ id: `gc-${p}-0`, pitch_id: "pitch-a", voter_key: key, voter_name: name,
      created_at: new Date(T0 + p * 80_000).toISOString() });
    votes.push({ id: `gc-${p}-1`, pitch_id: `pitch-${"bcdef"[p % 5]}`, voter_key: key, voter_name: name,
      created_at: new Date(T0 + p * 80_000 + 130_000).toISOString() });
    votes.push({ id: `gc-${p}-2`, pitch_id: `pitch-${"defgh"[p % 5]}`, voter_key: key, voter_name: name,
      created_at: new Date(T0 + p * 80_000 + 280_000).toISOString() });
  });

  const result = analyzeVotes(votes);
  assert.equal(clusterOfType(result, "pitch_burst"), undefined);
  assert.equal(result.clusters.length, 0, "nine ordinary voters are not a finding");
});

test("a genuinely popular pitch does not flag", () => {
  // Twelve distinct people over six hours, most of whom vote for
  // something else too. Popular is not suspicious.
  const votes = [];
  REAL_NAMES.forEach(([name, local], p) => {
    const key = `${local}@umich.edu`;
    votes.push({ id: `pop-${p}-0`, pitch_id: "pitch-a", voter_key: key, voter_name: name,
      created_at: new Date(T0 + p * 29 * 60_000).toISOString() });
    if (p % 4 !== 0) {
      votes.push({ id: `pop-${p}-1`, pitch_id: `pitch-${"bcdefg"[p % 6]}`, voter_key: key, voter_name: name,
        created_at: new Date(T0 + p * 29 * 60_000 + 400_000).toISOString() });
    }
  });

  assert.equal(analyzeVotes(votes).clusters.length, 0);
});

test("campus NAT is still not a ring", () => {
  // Ten real people behind one shared address, each spending three votes
  // across eight pitches. The dispersion penalty exists for exactly this,
  // and narrowing it to mailbox clusters must not have broken it.
  const votes = [];
  REAL_NAMES.slice(0, 10).forEach(([name, local], p) => {
    for (let k = 0; k < 3; k += 1) {
      votes.push({
        id: `nat-${p}-${k}`,
        pitch_id: `pitch-${"abcdefgh"[(p + k * 3) % 8]}`,
        voter_key: `${local}@umich.edu`,
        voter_name: name,
        created_at: new Date(T0 + (p * 7 + k * 13) * 60_000).toISOString(),
        ip_hash: "campus", ip_prefix_hash: "campus-24", user_agent_hash: `ua-${p % 5}`,
      });
    }
  });

  assert.equal(analyzeVotes(votes).clusters.length, 0);
});

test("velocity does not re-report a ring the clustering pass already has", () => {
  // One ring, one row in the queue. A burst that is already explained by
  // a shared address should not also arrive as a second, near-identical
  // flag for the admin to triage twice.
  const votes = REAL_NAMES.map(([name, local], i) => ({
    id: `dup-${i}`,
    pitch_id: "pitch-a",
    voter_key: `${local}${2020 + i}@outlook.com`,
    voter_name: name,
    created_at: new Date(T0 + i * 47_000).toISOString(),
    ip_hash: "one-address", ip_prefix_hash: "one-24", user_agent_hash: "one-ua",
  }));

  const result = analyzeVotes(votes);
  assert.ok(clusterOfType(result, "ip"), "the address cluster is the right home for this");
  assert.equal(clusterOfType(result, "pitch_burst"), undefined);
});
