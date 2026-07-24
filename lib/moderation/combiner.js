// Deterministic decision combiner.
//
// Takes zero or more sub-component results (any of: text, transcript,
// visual) and folds them into a single final ModerationState + summary.
//
// Design invariant: because this is a university platform, we DEFAULT
// toward human review, never automatic rejection. Auto-reject only fires
// when the caller (a provider adapter) explicitly returns decision =
// "rejected" AND the operator opted in via MODERATION_AUTO_REJECT=true.
// The adapter itself already enforces that check — the combiner only
// respects an already-produced "rejected" verdict.

import { MODERATION_STATE } from "./types.js";
import { getModerationConfig } from "../env.js";

/**
 * @typedef {Object} SubResult
 * @property {"text"|"transcript"|"visual"} channel
 * @property {import("./types.js").NormalizedModerationResult|null} result
 * @property {boolean} required Whether this channel is required for a final decision.
 */

/**
 * Combine sub-component results into a final decision and per-channel
 * component snapshots suitable for persistence.
 *
 * Rules:
 *   1. If ANY required channel is still processing / not yet run → returns
 *      state = "processing".
 *   2. If ANY channel returned decision = "rejected" AND auto-reject is
 *      enabled → final = "rejected".
 *   3. If ANY channel returned "rejected" without auto-reject           → "needs_review".
 *   4. If ANY channel returned "needs_review"                           → "needs_review".
 *   5. If ANY required channel returned "failed"                        → "needs_review".
 *      (Never auto-approve when a required component failed.)
 *   6. Otherwise, all channels returned "approved"                      → "approved".
 *
 * @param {SubResult[]} subResults
 * @returns {{ finalState: import("./types.js").ModerationState,
 *              summary: string,
 *              components: Record<string, {status:string,result:any}>,
 *              flagged_categories: string[],
 *              guidebook_violations: any[] }}
 */
export function combineDecisions(subResults) {
  const config = getModerationConfig();
  const components = {};
  for (const s of subResults) {
    components[s.channel] = {
      status: s.result ? mapResultToState(s.result.decision) : "not_started",
      result: s.result || null,
    };
  }

  // (1) Anything required that hasn't produced a decision yet.
  const pending = subResults.filter((s) => s.required && !s.result);
  if (pending.length > 0) {
    return {
      finalState: MODERATION_STATE.PROCESSING,
      summary: `Waiting on ${pending.map((s) => s.channel).join(", ")} moderation.`,
      components,
      flagged_categories: [],
      guidebook_violations: [],
    };
  }

  const withResult = subResults.filter((s) => s.result);
  const decisions = withResult.map((s) => s.result.decision);

  // (2) & (3): rejected handling.
  if (decisions.includes("rejected")) {
    if (config.features.autoReject) {
      return finalize(MODERATION_STATE.REJECTED, withResult,
        "Rejected: at least one moderation channel returned a reject decision.",
        components);
    }
    return finalize(MODERATION_STATE.NEEDS_REVIEW, withResult,
      "Held for review: at least one channel would auto-reject, but auto-reject is disabled.",
      components);
  }

  // (4) needs_review.
  if (decisions.includes("needs_review")) {
    return finalize(MODERATION_STATE.NEEDS_REVIEW, withResult,
      "Held for review: at least one channel returned needs_review.",
      components);
  }

  // (5) required + failed.
  const failedRequired = subResults.filter(
    (s) => s.required && s.result?.decision === "failed"
  );
  if (failedRequired.length > 0) {
    return finalize(MODERATION_STATE.NEEDS_REVIEW, withResult,
      `Held for review: required channel(s) failed — ${failedRequired.map((s) => s.channel).join(", ")}.`,
      components);
  }

  // (6) all approved.
  if (decisions.length > 0 && decisions.every((d) => d === "approved")) {
    return finalize(MODERATION_STATE.APPROVED, withResult,
      "Automatically approved: all moderation channels returned approved.",
      components);
  }

  // Fallback — no decisions at all means moderation hasn't started. This
  // shouldn't happen if callers wire the pipeline correctly, but if it
  // does we return NOT_STARTED rather than silently approving.
  return {
    finalState: MODERATION_STATE.NOT_STARTED,
    summary: "No moderation channels produced a decision.",
    components,
    flagged_categories: [],
    guidebook_violations: [],
  };
}

function finalize(finalState, withResult, summary, components) {
  const flagged_categories = Array.from(new Set(
    withResult.flatMap((s) => (s.result?.categories || [])
      .filter((c) => c.flagged)
      .map((c) => c.category))
  ));
  const guidebook_violations = withResult.flatMap(
    (s) => s.result?.guidebookViolations || []
  );
  return { finalState, summary, components, flagged_categories, guidebook_violations };
}

function mapResultToState(decision) {
  switch (decision) {
    case "approved": return MODERATION_STATE.APPROVED;
    case "needs_review": return MODERATION_STATE.NEEDS_REVIEW;
    case "rejected": return MODERATION_STATE.REJECTED;
    case "failed": return MODERATION_STATE.FAILED;
    default: return MODERATION_STATE.PROCESSING;
  }
}
