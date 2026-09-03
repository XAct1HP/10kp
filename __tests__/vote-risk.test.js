import { test } from "node:test";
import assert from "node:assert/strict";

const {
  canonicalizeEmail,
  nameEmailAffinity,
  computeVoteRisk,
  statusAfterScore,
  RISK_REVIEW_THRESHOLD,
} = await import("../lib/votes/risk.js");

test("canonicalizeEmail collapses gmail dots and plus tags", () => {
  assert.equal(
    canonicalizeEmail("O.Vi.Ya+vote@gmail.com"),
    "oviya@gmail.com"
  );
  assert.equal(canonicalizeEmail("oviya@googlemail.com"), "oviya@gmail.com");
  assert.equal(canonicalizeEmail("name+tag@umich.edu"), "name@umich.edu");
});

test("nameEmailAffinity detects submitter-like locals", () => {
  assert.ok(nameEmailAffinity("Oviya Arunachalam", "oviyaa@umich.edu") >= 1);
  assert.ok(nameEmailAffinity("Lauren Smith", "lauren.smith@gmail.com") >= 2);
  assert.equal(nameEmailAffinity("Someone Else", "zzz@umich.edu"), 0);
});

test("burst + self-vote push score into review", () => {
  const now = Date.now();
  const vote = {
    id: "v1",
    pitch_id: "p1",
    voter_email: "owner@umich.edu",
    voter_key: "owner@umich.edu",
    created_at: new Date(now).toISOString(),
  };
  const peers = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    pitch_id: "p1",
    voter_email: `u${i}@gmail.com`,
    voter_key: `u${i}@gmail.com`,
    created_at: new Date(now - i * 60_000).toISOString(),
  }));
  const { score, reasons } = computeVoteRisk({
    vote,
    peerVotes: peers,
    voterVotes: [vote],
    ownerEmail: "owner@umich.edu",
    pitchSubmitterName: "Owner Person",
    maxVotesPerUser: 5,
    now,
  });
  assert.ok(score >= RISK_REVIEW_THRESHOLD);
  assert.ok(reasons.some((r) => r.code === "burst_velocity"));
  assert.ok(reasons.some((r) => r.code === "self_vote"));
  assert.equal(statusAfterScore(score, "clear"), "review");
  assert.equal(statusAfterScore(score, "dismissed"), "dismissed");
});

test("near-duplicate emails on same pitch score", () => {
  const now = Date.now();
  const vote = {
    id: "v1",
    pitch_id: "p1",
    voter_email: "a.b+1@gmail.com",
    voter_key: "a.b+1@gmail.com",
    created_at: new Date(now).toISOString(),
  };
  const peers = [
    vote,
    {
      id: "v2",
      pitch_id: "p1",
      voter_email: "ab@gmail.com",
      voter_key: "ab@gmail.com",
      created_at: new Date(now).toISOString(),
    },
  ];
  const { score, reasons } = computeVoteRisk({
    vote,
    peerVotes: peers,
    voterVotes: [vote],
    now,
  });
  assert.ok(score >= 20);
  assert.ok(reasons.some((r) => r.code === "near_duplicate_emails"));
});
