// Comment-moderation unit tests. No external services; no Supabase.
// Run with `npm test`.
//
// The property that matters here is that nothing reaches a pitch owner by
// accident. Every decision that is not an explicit "approved" must land on a
// status the owner's queries filter out.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.UMGPT_API_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";

const { statusForDecision, COMMENT_STATUS, moderateCommentBody } = await import(
  "../lib/moderation/comments.js"
);

test("an approved comment is delivered", () => {
  assert.equal(statusForDecision("approved"), COMMENT_STATUS.APPROVED);
});

test("a rejected comment is blocked, not deleted", () => {
  assert.equal(statusForDecision("rejected"), COMMENT_STATUS.BLOCKED);
});

test("an ambiguous comment is held, not delivered", () => {
  assert.equal(statusForDecision("needs_review"), COMMENT_STATUS.PENDING);
});

test("a classifier failure is held, not delivered", () => {
  assert.equal(statusForDecision("failed"), COMMENT_STATUS.PENDING);
});

test("an unrecognized decision never reaches the owner", () => {
  // A provider that invents a new verdict string must not fail open.
  for (const bogus of ["ok", "APPROVED", "", null, undefined, "allow"]) {
    assert.notEqual(
      statusForDecision(bogus),
      COMMENT_STATUS.APPROVED,
      `decision ${JSON.stringify(bogus)} must not auto-approve`
    );
  }
});

test("only the literal 'approved' decision delivers", () => {
  const delivering = ["approved", "rejected", "needs_review", "failed", "weird"].filter(
    (d) => statusForDecision(d) === COMMENT_STATUS.APPROVED
  );
  assert.deepEqual(delivering, ["approved"]);
});

test("a provider outage holds the comment and explains why", async () => {
  // moderateCommentBody must resolve rather than throw: the caller has
  // already stored the comment and needs a status to write.
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  try {
    const verdict = await moderateCommentBody("perfectly ordinary feedback");
    assert.equal(verdict.status, COMMENT_STATUS.PENDING);
    assert.match(verdict.summary, /review/i);
    assert.deepEqual(verdict.categories, []);
  } finally {
    globalThis.fetch = original;
  }
});
