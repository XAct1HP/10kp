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
