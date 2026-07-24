// Shared moderation state constants and JSDoc types.
// This module is safe to import from any runtime — no side effects.

/**
 * Media (Mux/Supabase Storage) processing state.
 * @typedef {"uploading" | "processing" | "ready" | "errored" | "not_applicable"} MediaStatus
 */

/**
 * Transcript pipeline state.
 * @typedef {"not_started" | "processing" | "ready" | "not_applicable" | "failed"} TranscriptStatus
 */

/**
 * Final moderation state (also used for per-component visual/transcript states).
 * @typedef {"not_started" | "queued" | "processing" | "approved" | "needs_review" | "rejected" | "failed"} ModerationState
 */

/**
 * Structured category flag inside a normalized moderation result.
 * @typedef {Object} ModerationCategoryResult
 * @property {string} category
 * @property {boolean} flagged
 * @property {number} [confidence]
 * @property {"low"|"medium"|"high"} [severity]
 * @property {string} [explanation]
 * @property {string[]} [evidence]
 * @property {number[]} [timestamps]
 */

/**
 * @typedef {Object} GuidebookViolation
 * @property {string} [rule]
 * @property {string} explanation
 * @property {string[]} [evidence]
 */

/**
 * Normalized moderation result — the one shape used across text, audio,
 * transcript, and visual moderators. Provider-specific detail lives inside
 * `providerRaw` for auditing but must not be treated as authoritative.
 *
 * @typedef {Object} NormalizedModerationResult
 * @property {"approved"|"needs_review"|"rejected"|"failed"} decision
 * @property {string} summary
 * @property {ModerationCategoryResult[]} categories
 * @property {GuidebookViolation[]} guidebookViolations
 * @property {string} provider
 * @property {string} [providerVersion]
 * @property {string} completedAt
 * @property {any} [providerRaw]
 */

export const MEDIA_STATUS = Object.freeze({
  UPLOADING: "uploading",
  PROCESSING: "processing",
  READY: "ready",
  ERRORED: "errored",
  NOT_APPLICABLE: "not_applicable",
});

export const TRANSCRIPT_STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  PROCESSING: "processing",
  READY: "ready",
  NOT_APPLICABLE: "not_applicable",
  FAILED: "failed",
});

export const MODERATION_STATE = Object.freeze({
  NOT_STARTED: "not_started",
  QUEUED: "queued",
  PROCESSING: "processing",
  APPROVED: "approved",
  NEEDS_REVIEW: "needs_review",
  REJECTED: "rejected",
  FAILED: "failed",
});

export const TERMINAL_MODERATION_STATES = Object.freeze([
  MODERATION_STATE.APPROVED,
  MODERATION_STATE.NEEDS_REVIEW,
  MODERATION_STATE.REJECTED,
]);

// Canonical category names — kept stable for admin UI and analytics.
// Providers map their own taxonomies into this list.
export const MODERATION_CATEGORIES = Object.freeze([
  "harassment",
  "hate",
  "sexual_content",
  "graphic_violence",
  "self_harm",
  "dangerous_or_illegal",
  "personal_info_leak",
  "spam_or_irrelevant",
  "guidebook_violation",
  "other",
]);

export const PROVIDER = Object.freeze({
  UMGPT_TEXT: "umgpt-text",
  UMGPT_TRANSCRIPT: "umgpt-transcript",
  MUX_ROBOTS_VISUAL: "mux-robots-visual",
});

/**
 * Fresh normalized result with defaults filled in. Callers can mutate the
 * returned object; each call returns a new instance.
 * @returns {NormalizedModerationResult}
 */
export function emptyNormalizedResult(provider) {
  return {
    decision: "failed",
    summary: "",
    categories: [],
    guidebookViolations: [],
    provider,
    completedAt: new Date().toISOString(),
  };
}
