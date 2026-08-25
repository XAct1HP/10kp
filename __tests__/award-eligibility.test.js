import { test } from "node:test";
import assert from "node:assert/strict";

// The module pulls in lib/supabase.js, which builds a client at import time.
process.env.UMGPT_API_KEY = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.MUX_TOKEN_ID = "test";
process.env.MUX_TOKEN_SECRET = "test";
process.env.MUX_WEBHOOK_SECRET = "test";

const {
  buildPitchContent,
  awardRubric,
  buildEligibilityMessages,
  normalizeEligibilityResults,
  verdictToRow,
  AWARD_STATUS,
  MATCH_DECISION,
} = await import("../lib/awards/eligibility.js");

// ── buildPitchContent ───────────────────────────────────────────────────
test("pitch content joins title, description, text and transcript", () => {
  const content = buildPitchContent({
    title: "SolarDesk",
    description: "A desk that charges itself",
    text_content: null,
    transcript: "Hi, I'm pitching a solar-powered standing desk.",
  });
  assert.match(content, /SolarDesk/);
  assert.match(content, /charges itself/);
  assert.match(content, /solar-powered standing desk/);
});

test("pitch content is empty when there is nothing to judge", () => {
  assert.equal(buildPitchContent({ title: null, description: "  " }), "");
  assert.equal(buildPitchContent(null), "");
});

// ── awardRubric ─────────────────────────────────────────────────────────
test("rubric prefers admin criteria over the public description", () => {
  assert.equal(
    awardRubric({ criteria: "Must be hardware.", description: "For builders." }),
    "Must be hardware."
  );
});

test("rubric falls back to the description when no criteria are set", () => {
  assert.equal(awardRubric({ criteria: "", description: "For builders." }), "For builders.");
  assert.equal(awardRubric({}), "");
});

// ── buildEligibilityMessages ────────────────────────────────────────────
test("prompt lists every award with its id and rubric", () => {
  const messages = buildEligibilityMessages({
    pitchContent: "A solar desk.",
    awards: [
      { id: "a-1", name: "Hardware Prize", criteria: "Must be a physical product." },
      { id: "a-2", name: "Sustainability Prize", description: "Environmental impact." },
    ],
  });
  assert.equal(messages.length, 2);
  const user = messages[1].content;
  assert.match(user, /id: a-1/);
  assert.match(user, /Must be a physical product\./);
  assert.match(user, /id: a-2/);
  assert.match(user, /Environmental impact\./);
  assert.match(user, /A solar desk\./);
});

test("an award with no rubric is called out rather than left blank", () => {
  const messages = buildEligibilityMessages({
    pitchContent: "A solar desk.",
    awards: [{ id: "a-1", name: "Mystery Prize" }],
  });
  assert.match(messages[1].content, /none provided/);
});

test("the prompt never leaks admin criteria into the system role", () => {
  const messages = buildEligibilityMessages({
    pitchContent: "x",
    awards: [{ id: "a-1", name: "P", criteria: "SECRET-RUBRIC" }],
  });
  assert.doesNotMatch(messages[0].content, /SECRET-RUBRIC/);
});

// ── normalizeEligibilityResults ─────────────────────────────────────────
test("clear verdicts pass through with clamped confidence", () => {
  const out = normalizeEligibilityResults(
    {
      results: [
        { award_id: "a-1", verdict: "match", confidence: 0.91, reason: "Builds a device." },
        { award_id: "a-2", verdict: "no_match", confidence: 4, reason: "Pure software." },
      ],
    },
    ["a-1", "a-2"]
  );
  assert.equal(out.get("a-1").verdict, MATCH_DECISION.MATCH);
  assert.equal(out.get("a-1").confidence, 0.91);
  assert.equal(out.get("a-2").verdict, MATCH_DECISION.NO_MATCH);
  assert.equal(out.get("a-2").confidence, 1);
});

test("an award the model skipped is unverified, never a removal", () => {
  const out = normalizeEligibilityResults({ results: [] }, ["a-1"]);
  assert.equal(out.get("a-1").verdict, MATCH_DECISION.UNVERIFIED);
  assert.equal(verdictToRow(out.get("a-1")).status, AWARD_STATUS.ELIGIBLE);
});

test("garbage from the model never removes a pitch from a track", () => {
  for (const raw of [null, {}, { results: "nope" }, { results: [{ award_id: "a-1", verdict: "maybe" }] }]) {
    const out = normalizeEligibilityResults(raw, ["a-1"]);
    assert.equal(
      verdictToRow(out.get("a-1")).status,
      AWARD_STATUS.ELIGIBLE,
      `raw ${JSON.stringify(raw)} must not remove the track`
    );
  }
});

test("verdicts for awards we did not ask about are ignored", () => {
  const out = normalizeEligibilityResults(
    { results: [{ award_id: "other", verdict: "no_match" }] },
    ["a-1"]
  );
  assert.equal(out.size, 1);
  assert.ok(out.has("a-1"));
  assert.equal(out.get("a-1").verdict, MATCH_DECISION.UNVERIFIED);
});

test("the first verdict for an award wins over a duplicate", () => {
  const out = normalizeEligibilityResults(
    {
      results: [
        { award_id: "a-1", verdict: "match", reason: "first" },
        { award_id: "a-1", verdict: "no_match", reason: "second" },
      ],
    },
    ["a-1"]
  );
  assert.equal(out.get("a-1").verdict, MATCH_DECISION.MATCH);
  assert.equal(out.get("a-1").reason, "first");
});

test("a non-string reason does not crash normalization", () => {
  const out = normalizeEligibilityResults(
    { results: [{ award_id: "a-1", verdict: "no_match", reason: { x: 1 } }] },
    ["a-1"]
  );
  assert.equal(out.get("a-1").reason, "");
});

// ── verdictToRow ────────────────────────────────────────────────────────
test("only a no_match removes the pitch from the track", () => {
  const now = "2026-08-25T00:00:00.000Z";
  assert.equal(
    verdictToRow({ verdict: MATCH_DECISION.NO_MATCH, confidence: 0.9, reason: "r" }, { now }).status,
    AWARD_STATUS.REMOVED
  );
  assert.equal(
    verdictToRow({ verdict: MATCH_DECISION.MATCH, confidence: 0.9, reason: "r" }, { now }).status,
    AWARD_STATUS.ELIGIBLE
  );
  assert.equal(
    verdictToRow({ verdict: MATCH_DECISION.UNVERIFIED, confidence: null, reason: "" }, { now }).status,
    AWARD_STATUS.ELIGIBLE
  );
});

test("verdictToRow stamps the check time and nulls an empty reason", () => {
  const now = "2026-08-25T00:00:00.000Z";
  const row = verdictToRow({ verdict: MATCH_DECISION.MATCH, confidence: null, reason: "" }, { now });
  assert.equal(row.checked_at, now);
  assert.equal(row.match_reason, null);
  assert.equal(row.match_confidence, null);
});
