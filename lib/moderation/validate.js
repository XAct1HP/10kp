// Tiny schema validator for moderation payloads.
// Zod isn't installed in this project. Rather than add a dependency for a
// handful of shapes, we validate structurally with small helper functions
// that mirror what Zod would do — throwing SchemaError on invalid input.

export class SchemaError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SchemaError";
    this.details = details;
  }
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string";
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isBool = (v) => typeof v === "boolean";
const isArray = Array.isArray;

const ALLOWED_DECISIONS = ["approved", "needs_review", "rejected"];
const ALLOWED_SEVERITY = ["low", "medium", "high"];

/**
 * Validate and normalize a UMGPT moderation JSON payload.
 *
 * Accepted shape (from the prompt):
 * {
 *   decision: "approved" | "needs_review" | "rejected",
 *   summary: string,
 *   categories: [{
 *     category: string, flagged?: bool, confidence?: number,
 *     severity?: "low"|"medium"|"high",
 *     explanation?: string, evidence?: string[]
 *   }],
 *   guidebook_violations: [{
 *     rule?: string, explanation: string, evidence?: string[]
 *   }]
 * }
 *
 * Returns a normalized-but-not-provider-tagged object; the caller stamps
 * `provider` and `completedAt` on top.
 */
export function validateUmgptModerationJson(raw) {
  if (!isPlainObject(raw)) {
    throw new SchemaError("UMGPT response is not an object");
  }
  if (!ALLOWED_DECISIONS.includes(raw.decision)) {
    throw new SchemaError(
      `UMGPT response has invalid decision "${raw.decision}"`
    );
  }
  const summary = isString(raw.summary) ? raw.summary.trim() : "";

  const rawCategories = isArray(raw.categories) ? raw.categories : [];
  const categories = rawCategories
    .filter(isPlainObject)
    .map((c) => ({
      category: isString(c.category) && c.category.trim()
        ? c.category.trim()
        : "other",
      flagged: c.flagged === undefined ? true : Boolean(c.flagged),
      confidence: isNumber(c.confidence)
        ? Math.max(0, Math.min(1, c.confidence))
        : undefined,
      severity: ALLOWED_SEVERITY.includes(c.severity) ? c.severity : undefined,
      explanation: isString(c.explanation) ? c.explanation.trim() : undefined,
      evidence: isArray(c.evidence)
        ? c.evidence.filter(isString).slice(0, 5)
        : undefined,
    }));

  const rawViolations = isArray(raw.guidebook_violations)
    ? raw.guidebook_violations
    : [];
  const guidebookViolations = rawViolations
    .filter(isPlainObject)
    .map((v) => ({
      rule: isString(v.rule) ? v.rule.trim() : undefined,
      explanation: isString(v.explanation)
        ? v.explanation.trim()
        : "(no explanation provided)",
      evidence: isArray(v.evidence)
        ? v.evidence.filter(isString).slice(0, 5)
        : undefined,
    }));

  return {
    decision: raw.decision,
    summary,
    categories,
    guidebookViolations,
  };
}
