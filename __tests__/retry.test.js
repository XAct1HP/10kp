import { test } from "node:test";
import assert from "node:assert/strict";

process.env.UMGPT_API_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";

const { computeNextAttemptAt, isRetryable, hasBudgetLeft } = await import(
  "../lib/moderation/retry.js"
);

// Values hardcoded in lib/env.js — update these constants if the RETRY
// block there changes.
const HARDCODED_MAX_ATTEMPTS = 5;
const HARDCODED_BACKOFF_CAP_MS = 15 * 60000;

test("computeNextAttemptAt returns exponential backoff", () => {
  const t1 = new Date(computeNextAttemptAt(1));
  const t2 = new Date(computeNextAttemptAt(2));
  const t3 = new Date(computeNextAttemptAt(3));
  assert.ok(t1.getTime() < t2.getTime());
  assert.ok(t2.getTime() < t3.getTime());
});

test("computeNextAttemptAt respects the cap", () => {
  const t = new Date(computeNextAttemptAt(50));
  const capWithSlack = HARDCODED_BACKOFF_CAP_MS + 5000;
  assert.ok(t.getTime() - Date.now() <= capWithSlack);
});

test("isRetryable detects explicit .retryable and common transient errors", () => {
  assert.equal(isRetryable({ retryable: true }), true);
  assert.equal(isRetryable({ retryable: false }), false);
  assert.equal(isRetryable(new Error("network timeout")), true);
  assert.equal(isRetryable(new Error("permission denied")), false);
  assert.equal(isRetryable(null), false);
});

test("hasBudgetLeft respects hardcoded max attempts", () => {
  assert.equal(hasBudgetLeft(0), true);
  assert.equal(hasBudgetLeft(HARDCODED_MAX_ATTEMPTS - 1), true);
  assert.equal(hasBudgetLeft(HARDCODED_MAX_ATTEMPTS), false);
});
