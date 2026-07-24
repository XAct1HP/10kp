// UMGPT response validator unit tests.
import { test } from "node:test";
import assert from "node:assert/strict";

const { validateUmgptModerationJson, SchemaError } = await import(
  "../lib/moderation/validate.js"
);

test("valid approved payload passes", () => {
  const out = validateUmgptModerationJson({
    decision: "approved",
    summary: "Clean",
    categories: [],
    guidebook_violations: [],
  });
  assert.equal(out.decision, "approved");
  assert.equal(out.summary, "Clean");
  assert.equal(out.categories.length, 0);
});

test("missing decision throws SchemaError", () => {
  assert.throws(() => validateUmgptModerationJson({ summary: "x" }), SchemaError);
});

test("invalid decision throws SchemaError", () => {
  assert.throws(
    () => validateUmgptModerationJson({ decision: "kinda-approved", summary: "x" }),
    SchemaError
  );
});

test("categories are normalized to expected shape", () => {
  const out = validateUmgptModerationJson({
    decision: "needs_review",
    summary: "check it",
    categories: [
      { category: "hate", severity: "high", confidence: 0.9, evidence: ["bad word"] },
      { category: "hate", severity: "wrong-severity" }, // severity is dropped
      "not-an-object",                                  // ignored
    ],
    guidebook_violations: [{ rule: "R1", explanation: "y" }],
  });
  assert.equal(out.categories.length, 2);
  assert.equal(out.categories[0].severity, "high");
  assert.equal(out.categories[1].severity, undefined);
  assert.equal(out.guidebookViolations.length, 1);
});

test("non-object input is rejected", () => {
  assert.throws(() => validateUmgptModerationJson(null), SchemaError);
  assert.throws(() => validateUmgptModerationJson("hello"), SchemaError);
});
