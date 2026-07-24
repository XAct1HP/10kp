// Mux visual moderation normalization tests. Mocks the raw Mux job shape.
import { test } from "node:test";
import assert from "node:assert/strict";

// Env stubs so getModerationConfig() is happy.
process.env.UMGPT_API_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";
process.env.MUX_MODERATION_SEXUAL_REVIEW_THRESHOLD = "0.5";
process.env.MUX_MODERATION_VIOLENCE_REVIEW_THRESHOLD = "0.6";
process.env.MUX_MODERATION_SEXUAL_REJECT_THRESHOLD = "0.9";
process.env.MUX_MODERATION_VIOLENCE_REJECT_THRESHOLD = "0.95";

const { normalizeVisualModerationResult } = await import(
  "../lib/moderation/mux-visual-moderation.js"
);

function completedJob(scores, thumbs = []) {
  return {
    id: "job_test",
    status: "completed",
    workflow: "moderate",
    created_at: 0,
    updated_at: 0,
    units_consumed: 1,
    outputs: {
      exceeds_threshold: scores.sexual >= 0.5 || scores.violence >= 0.6,
      max_scores: scores,
      thumbnail_scores: thumbs,
    },
    parameters: { asset_id: "asset_x" },
  };
}

test("scores below review thresholds → approved", () => {
  const out = normalizeVisualModerationResult(completedJob({ sexual: 0.1, violence: 0.2 }));
  assert.equal(out.decision, "approved");
  assert.equal(out.provider, "mux-robots-visual");
});

test("scores above review threshold → needs_review", () => {
  const out = normalizeVisualModerationResult(completedJob({ sexual: 0.6, violence: 0.2 }));
  assert.equal(out.decision, "needs_review");
});

test("scores above reject threshold default to needs_review (auto-reject hardcoded off)", () => {
  const out = normalizeVisualModerationResult(completedJob({ sexual: 0.99, violence: 0.99 }));
  assert.equal(out.decision, "needs_review");
});

test("errored job → failed", () => {
  const out = normalizeVisualModerationResult({
    id: "job_test",
    status: "errored",
    workflow: "moderate",
    created_at: 0,
    updated_at: 0,
    units_consumed: 0,
    errors: [{ message: "asset not found", type: "asset_missing" }],
    parameters: { asset_id: "asset_x" },
  });
  assert.equal(out.decision, "failed");
});

test("flagged thumbnails carry timestamps", () => {
  const out = normalizeVisualModerationResult(
    completedJob(
      { sexual: 0.7, violence: 0.1 },
      [
        { sexual: 0.9, violence: 0.05, time: 4.5 },
        { sexual: 0.2, violence: 0.05, time: 10 },
      ]
    )
  );
  assert.equal(out.decision, "needs_review");
  const sexual = out.categories.find((c) => c.category === "sexual_content");
  assert.ok(sexual.timestamps.includes(4.5));
});
