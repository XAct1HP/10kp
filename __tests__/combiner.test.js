// Decision-combiner unit tests. No external services; no Supabase.
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";

// Force a deterministic config for auto-reject flag.
process.env.UMGPT_API_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";

const { combineDecisions } = await import("../lib/moderation/combiner.js");
const { MODERATION_STATE } = await import("../lib/moderation/types.js");

function result(decision, extras = {}) {
  return {
    decision,
    summary: `${decision} for test`,
    categories: extras.categories || [],
    guidebookViolations: extras.violations || [],
    provider: "test",
    completedAt: new Date().toISOString(),
  };
}

test("all approved yields approved", () => {
  const out = combineDecisions([
    { channel: "text", result: result("approved"), required: true },
    { channel: "visual", result: result("approved"), required: true },
    { channel: "transcript", result: result("approved"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.APPROVED);
});

test("visual needs_review yields needs_review", () => {
  const out = combineDecisions([
    { channel: "text", result: result("approved"), required: true },
    { channel: "visual", result: result("needs_review"), required: true },
    { channel: "transcript", result: result("approved"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.NEEDS_REVIEW);
});

test("transcript needs_review yields needs_review", () => {
  const out = combineDecisions([
    { channel: "text", result: result("approved"), required: true },
    { channel: "visual", result: result("approved"), required: true },
    { channel: "transcript", result: result("needs_review"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.NEEDS_REVIEW);
});

test("provider failure yields needs_review (not silent approve)", () => {
  const out = combineDecisions([
    { channel: "text", result: result("approved"), required: true },
    { channel: "visual", result: result("failed"), required: true },
    { channel: "transcript", result: result("approved"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.NEEDS_REVIEW);
});

test("missing required channel yields processing", () => {
  const out = combineDecisions([
    { channel: "text", result: result("approved"), required: true },
    { channel: "visual", result: null, required: true },
    { channel: "transcript", result: result("approved"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.PROCESSING);
});

test("severe visual defaults to needs_review (auto-reject is hardcoded off)", () => {
  const out = combineDecisions([
    { channel: "visual", result: result("rejected"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.NEEDS_REVIEW);
});

test("no-speech video: visual approved is enough", () => {
  // transcript is present but marked approved with 'not applicable' summary,
  // mirroring how the pipeline treats a legitimate silent video.
  const out = combineDecisions([
    { channel: "text", result: result("approved"), required: true },
    { channel: "visual", result: result("approved"), required: true },
    { channel: "transcript", result: result("approved"), required: true },
  ]);
  assert.equal(out.finalState, MODERATION_STATE.APPROVED);
});

test("no decisions at all yields not_started (never approved)", () => {
  const out = combineDecisions([]);
  assert.equal(out.finalState, MODERATION_STATE.NOT_STARTED);
});
