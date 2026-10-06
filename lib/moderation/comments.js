// Comment moderation — the step between "a student submitted feedback" and
// "the pitch owner can read it".
//
// Design, mirroring lib/moderation/pipeline.js:
//   * Never silently approves. A classifier that errors, times out, or
//     returns malformed JSON leaves the comment `pending`, which is
//     admin-visible and owner-invisible.
//   * Never silently loses a comment either. A blocked or held row stays in
//     the table so the admin thread for a pitch is a complete record.
//   * Lenient on tone, strict on abuse. The prompt in umgpt-adapter.js does
//     that work; this module only maps a decision onto a stored status.

import { moderateCommentWithUmgpt } from "./umgpt-adapter.js";

export const COMMENT_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  BLOCKED: "blocked",
});

/**
 * Map a classifier decision onto a stored comment status.
 *
 *   approved     → approved  delivered to the pitch owner
 *   rejected     → blocked   withheld, kept for the admin record
 *   needs_review → pending   genuinely ambiguous; an admin decides
 *   failed       → pending   provider broke; an admin decides
 *
 * `needs_review` and `failed` both land on `pending` but for different
 * reasons, so the summary text keeps them distinguishable in the admin UI.
 */
export function statusForDecision(decision) {
  switch (decision) {
    case "approved":
      return COMMENT_STATUS.APPROVED;
    case "rejected":
      return COMMENT_STATUS.BLOCKED;
    case "needs_review":
    case "failed":
    default:
      return COMMENT_STATUS.PENDING;
  }
}

/**
 * Classify one comment body.
 *
 * Always resolves — a provider failure comes back as a `pending` verdict with
 * an explanatory summary rather than a thrown error, because the caller has
 * already written the comment row and needs a status to store.
 *
 * @param {string} body
 * @returns {Promise<{status: string, summary: string, categories: Array, provider: string, checkedAt: string}>}
 */
export async function moderateCommentBody(body) {
  const checkedAt = new Date().toISOString();
  try {
    const result = await moderateCommentWithUmgpt({ text: body });
    const status = statusForDecision(result.decision);

    // Fold guidebook violations into the category list so the admin UI has
    // one array to render rather than two shapes to special-case.
    const categories = [
      ...(result.categories || []).filter((c) => c.flagged),
      ...(result.guidebookViolations || []).map((v) => ({
        category: "guidebook_violation",
        flagged: true,
        severity: "medium",
        explanation: v.explanation || v.rule || "",
        evidence: v.evidence || [],
      })),
    ];

    return {
      status,
      summary:
        result.decision === "needs_review"
          ? `Held for review: ${result.summary}`
          : result.summary,
      categories,
      provider: result.provider || "umgpt-comment",
      checkedAt: result.completedAt || checkedAt,
    };
  } catch (err) {
    // Transient or permanent, the answer is the same: do not deliver it, do
    // not drop it, and tell the admin why it is sitting there.
    console.error("[moderation.comments] classification failed", {
      error: err?.message,
    });
    return {
      status: COMMENT_STATUS.PENDING,
      summary: `Held for review: the moderation service was unavailable (${
        err?.message || "unknown error"
      }).`,
      categories: [],
      provider: "unavailable",
      checkedAt,
    };
  }
}
