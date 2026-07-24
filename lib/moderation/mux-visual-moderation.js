// Mux Robots visual-moderation adapter (Beta).
//
// Encapsulates every Robots-Preview-specific call so the rest of the
// pipeline knows nothing about the API's shape. If Robots leaves Beta and
// changes its interface, or if we decide to replace it with a different
// visual-moderation provider, only this file needs to change.
//
// Job lifecycle:
//   startVisualModeration(assetId)   -> returns {jobId, status}
//   fetchVisualModerationJob(jobId)  -> returns raw ModerateJob
//   normalizeVisualModerationResult(job, config) -> NormalizedModerationResult
//
// Mux Robots does not currently ship a dedicated webhook event, so the
// pipeline polls via a scheduled reconciliation route. Jobs are auto-
// deleted after 30 days.

import { getMuxClient } from "../mux.js";
import { getModerationConfig } from "../env.js";
import { PROVIDER } from "./types.js";

const WORKFLOW = "moderate";

/**
 * Start a Mux Robots moderation job for a video asset.
 * @param {string} assetId The Mux asset ID.
 * @param {{ passthrough?: string }} [opts]
 * @returns {Promise<{jobId:string,status:string,createdAt:number}>}
 */
export async function startVisualModeration(assetId, opts = {}) {
  const mux = getMuxClient();
  const config = getModerationConfig();

  if (!config.features.muxRobotsEnabled) {
    throw new Error("Mux Robots visual moderation is disabled via MODERATION_MUX_ROBOTS=false");
  }
  if (!assetId) {
    throw new Error("startVisualModeration requires an assetId");
  }

  const job = await mux.robotsPreview.jobs.moderate.create({
    parameters: {
      asset_id: assetId,
      thresholds: {
        sexual: config.visual.reviewSexual,
        violence: config.visual.reviewViolence,
      },
      sampling_interval: config.visual.samplingIntervalSec,
      max_samples: config.visual.maxSamples,
    },
    passthrough: opts.passthrough,
  });

  return {
    jobId: job.id,
    status: job.status,
    createdAt: job.created_at,
  };
}

/** Retrieve a moderation job's current status/outputs. */
export async function fetchVisualModerationJob(jobId) {
  if (!jobId) throw new Error("fetchVisualModerationJob requires a jobId");
  const mux = getMuxClient();
  return mux.robotsPreview.jobs.moderate.retrieve(jobId);
}

/** Cancel an in-flight job (best-effort; ignored for terminal jobs). */
export async function cancelVisualModerationJob(jobId) {
  if (!jobId) return null;
  try {
    const mux = getMuxClient();
    return await mux.robotsPreview.jobs.cancel(jobId);
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Map a raw Mux ModerateJob into a NormalizedModerationResult.
 *
 * Decision derivation:
 *   * job.status !== 'completed'  -> {decision:'failed'}, caller decides
 *   * autoReject enabled AND any max_score >= reject threshold -> 'rejected'
 *   * any max_score >= review threshold                        -> 'needs_review'
 *   * else                                                     -> 'approved'
 *
 * `providerRaw` retains the outputs and the flagged thumbnail timestamps so
 * admins can jump to the moment in the video.
 *
 * @param {import("@mux/mux-node/resources/robots-preview/jobs/moderate").ModerateJob} job
 * @returns {import("./types.js").NormalizedModerationResult}
 */
export function normalizeVisualModerationResult(job) {
  const config = getModerationConfig();
  const now = new Date().toISOString();
  const provider = PROVIDER.MUX_ROBOTS_VISUAL;

  if (!job) {
    return {
      decision: "failed",
      summary: "No visual moderation job returned by Mux.",
      categories: [],
      guidebookViolations: [],
      provider,
      completedAt: now,
    };
  }

  if (job.status !== "completed") {
    const errMsg = Array.isArray(job.errors) && job.errors.length
      ? job.errors.map((e) => e.message).join("; ")
      : `Job status = ${job.status}`;
    return {
      decision: "failed",
      summary: `Mux visual moderation did not complete: ${errMsg}`,
      categories: [],
      guidebookViolations: [],
      provider,
      completedAt: now,
      providerRaw: job,
    };
  }

  const outputs = job.outputs || { max_scores: { sexual: 0, violence: 0 }, thumbnail_scores: [] };
  const maxSexual = Number(outputs.max_scores?.sexual) || 0;
  const maxViolence = Number(outputs.max_scores?.violence) || 0;

  const rejectSexual = config.visual.rejectSexual;
  const rejectViolence = config.visual.rejectViolence;
  const reviewSexual = config.visual.reviewSexual;
  const reviewViolence = config.visual.reviewViolence;

  const wantsAutoReject = config.features.autoReject &&
    (maxSexual >= rejectSexual || maxViolence >= rejectViolence);
  const wantsReview = maxSexual >= reviewSexual || maxViolence >= reviewViolence;

  // Collect flagged thumbnail timestamps so admins can jump to the frame.
  const flaggedThumbnails = (outputs.thumbnail_scores || [])
    .filter((t) => t.sexual >= reviewSexual || t.violence >= reviewViolence)
    .map((t) => ({
      time: typeof t.time === "number" ? t.time : null,
      sexual: t.sexual,
      violence: t.violence,
    }));

  const categories = [];
  if (maxSexual > 0) {
    categories.push({
      category: "sexual_content",
      flagged: maxSexual >= reviewSexual,
      confidence: maxSexual,
      severity: maxSexual >= rejectSexual ? "high"
              : maxSexual >= reviewSexual ? "medium" : "low",
      explanation: `Max visual sexual-content score: ${maxSexual.toFixed(2)} ` +
        `(review ≥ ${reviewSexual}, reject ≥ ${rejectSexual})`,
      timestamps: flaggedThumbnails
        .filter((t) => t.sexual >= reviewSexual && typeof t.time === "number")
        .map((t) => t.time),
    });
  }
  if (maxViolence > 0) {
    categories.push({
      category: "graphic_violence",
      flagged: maxViolence >= reviewViolence,
      confidence: maxViolence,
      severity: maxViolence >= rejectViolence ? "high"
              : maxViolence >= reviewViolence ? "medium" : "low",
      explanation: `Max visual violence score: ${maxViolence.toFixed(2)} ` +
        `(review ≥ ${reviewViolence}, reject ≥ ${rejectViolence})`,
      timestamps: flaggedThumbnails
        .filter((t) => t.violence >= reviewViolence && typeof t.time === "number")
        .map((t) => t.time),
    });
  }

  let decision;
  let summary;
  if (wantsAutoReject) {
    decision = "rejected";
    summary = "Mux Robots detected content above the configured auto-reject threshold.";
  } else if (wantsReview) {
    decision = "needs_review";
    summary = "Mux Robots flagged content above the review threshold — pending human review.";
  } else {
    decision = "approved";
    summary = `Mux Robots visual moderation passed (sexual=${maxSexual.toFixed(2)}, violence=${maxViolence.toFixed(2)}).`;
  }

  return {
    decision,
    summary,
    categories,
    guidebookViolations: [], // visual moderator does not evaluate the guidebook
    provider,
    providerVersion: WORKFLOW,
    completedAt: now,
    providerRaw: {
      exceeds_threshold: outputs.exceeds_threshold,
      max_scores: outputs.max_scores,
      flagged_thumbnails: flaggedThumbnails,
      job_id: job.id,
      units_consumed: job.units_consumed,
    },
  };
}
