// Retry / backoff bookkeeping for moderation attempts.
//
// The pipeline calls scheduleRetry() when it hits a transient failure.
// The reconciler cron (app/api/cron/moderation-reconcile) reads rows where
// moderation_next_attempt_at <= now() and re-runs the pipeline for them.

import { getModerationConfig } from "../env.js";

/**
 * Compute the next-attempt ISO timestamp given the current attempt count.
 * Exponential backoff with a hard cap.
 * @param {number} attempt 1-based attempt count for the *next* try.
 */
export function computeNextAttemptAt(attempt) {
  const { retry } = getModerationConfig();
  const delay = Math.min(
    retry.backoffMs * Math.pow(2, Math.max(0, attempt - 1)),
    retry.backoffCapMs
  );
  return new Date(Date.now() + delay).toISOString();
}

/** Whether an error is worth retrying. */
export function isRetryable(err) {
  if (err == null) return false;
  if (err.retryable === true) return true;
  if (err.retryable === false) return false;
  // Common transient network signals.
  const msg = String(err.message || err);
  return /timeout|ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|fetch failed/i.test(msg);
}

/**
 * Should we still keep trying? Compares attempt count against the
 * configured max. Attempt count is the count of attempts *already* made.
 */
export function hasBudgetLeft(attemptsMade) {
  const { retry } = getModerationConfig();
  return attemptsMade < retry.maxAttempts;
}
