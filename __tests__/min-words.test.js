import { test } from "node:test";
import assert from "node:assert/strict";

process.env.UMGPT_API_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";

const { MIN_PITCH_WORDS, countWords, meetsMinimumWords } = await import("../lib/pitchWords.js");
const { buildMinWordsRejection, MODERATION_STATE } = await import("../lib/moderation/pipeline.js");

test("minimum is 50 words", () => {
  assert.equal(MIN_PITCH_WORDS, 50);
});

test("countWords ignores extra whitespace and punctuation-only tokens", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords(null), 0);
  assert.equal(countWords("  hello \n\n world\t"), 2);
  assert.equal(countWords("idea - one • two ... 3"), 4);
});

test("exactly 50 words passes, 49 does not", () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  assert.equal(meetsMinimumWords(words(50)), true);
  assert.equal(meetsMinimumWords(words(49)), false);
});

test("short pitch rejection is a hard reject, not a review hold", () => {
  const out = buildMinWordsRejection("transcript", 12, "video transcript");
  assert.equal(out.finalState, MODERATION_STATE.REJECTED);
  assert.equal(out.rejectionCode, "min_words");
  assert.equal(out.wordCount, 12);
  assert.equal(out.components.transcript.result.decision, "rejected");
  assert.match(out.summary, /12 words/);
  assert.match(out.summary, /at least 50 words/);
});
