// Moderation pipeline v2 — orchestrator.
//
// Owns the state transitions of a pitch through moderation:
//   not_started -> queued -> processing -> {approved | needs_review | rejected | failed}
//
// Design principles:
//   * Idempotent. Guarded by moderation_state — a pitch that's already
//     `processing` is not re-entered by a duplicate trigger.
//   * Deterministic. Each channel writes into its own *_moderation_status
//     column; the combiner produces the final state from those columns.
//   * Never silently approves. Provider errors surface as failed →
//     needs_review (or retry, if attempts remain).
//   * Provider details live in adapters (umgpt-adapter, mux-visual-moderation).
//   * Fire-and-forget from HTTP routes; durable retries via the reconciler
//     cron (see app/api/cron/moderation-reconcile).

import { getSupabaseAdmin } from "../supabase.js";
import { moderateTextWithUmgpt } from "./umgpt-adapter.js";
import { extractDocText } from "./doc-extract.js";
import {
  startVisualModeration,
  fetchVisualModerationJob,
  normalizeVisualModerationResult,
} from "./mux-visual-moderation.js";
import { fetchMuxTranscript } from "./transcript.js";
import { combineDecisions } from "./combiner.js";
import { writeAudit } from "./audit.js";
import { computeNextAttemptAt, isRetryable, hasBudgetLeft } from "./retry.js";
import { getModerationConfig } from "../env.js";
import {
  MODERATION_STATE,
  TRANSCRIPT_STATUS,
  MEDIA_STATUS,
  PROVIDER,
} from "./types.js";

const VIDEO_SETTLE_WINDOW_MS = 20_000;
const VIDEO_POLL_INTERVAL_MS = 4_000;
const TRANSCRIPT_WAIT_GRACE_MS = 2 * 60_000;
const TRANSCRIPT_MAX_PENDING_ATTEMPTS = 2;
const VISUAL_START_RETRYABLE_ATTEMPTS = 1;

// ─── Public entry points ───────────────────────────────────────────────

/**
 * Enqueue a pitch for moderation. Awaitable — but callers from HTTP
 * handlers should NOT await unless they can tolerate several-second
 * latency. Use runModerationInBackground() from HTTP handlers.
 */
export async function runModeration(pitchId) {
  const supabase = getSupabaseAdmin();

  // ─── Atomic reservation: only proceed if the pitch is in a state we
  // can transition to `processing`. This guards against duplicate concurrent
  // triggers from webhook re-deliveries or admin retries.
  const now = new Date().toISOString();
  const { data: reserved, error: reserveErr } = await supabase
    .from("pitches")
    .update({
      moderation_state: MODERATION_STATE.PROCESSING,
      moderation_started_at: now,
      moderation_last_error: null,
      moderation_next_attempt_at: null,
      moderation_last_attempt_at: now,
    })
    .eq("id", pitchId)
    .in("moderation_state", [
      MODERATION_STATE.NOT_STARTED,
      MODERATION_STATE.QUEUED,
      MODERATION_STATE.FAILED,
    ])
    .select("id, moderation_attempt_count")
    .maybeSingle();

  if (reserveErr) {
    throw new Error(`Failed to reserve pitch ${pitchId}: ${reserveErr.message}`);
  }
  if (!reserved) {
    // Another worker owns this pitch, or it's already in a terminal state.
    return { skipped: true, reason: "already-in-progress-or-terminal" };
  }

  // Increment attempt count separately so it never resets on state changes.
  await supabase
    .from("pitches")
    .update({ moderation_attempt_count: (reserved.moderation_attempt_count || 0) + 1 })
    .eq("id", pitchId);

  await writeAudit(supabase, {
    pitchId,
    action: "moderation_started",
    newState: MODERATION_STATE.PROCESSING,
  });

  try {
    const { data: pitch } = await supabase
      .from("pitches")
      .select("*")
      .eq("id", pitchId)
      .single();
    if (!pitch) throw new Error("Pitch disappeared during moderation");

    const outcome = await orchestrate(pitch, supabase);
    await persistTerminal(supabase, pitch, outcome);
    return outcome;
  } catch (err) {
    await handleFailure(supabase, pitchId, err);
    throw err;
  }
}

/**
 * Fire-and-forget wrapper. Errors are logged but not surfaced. HTTP
 * routes call this and return an HTTP response immediately.
 *
 * On Vercel, background promises may be killed after the response is
 * flushed. The design compensates by:
 *   * marking the row `queued` in the caller so the reconciler can pick
 *     it up if the process dies;
 *   * running the pipeline anyway, opportunistically, when the platform
 *     keeps the invocation warm long enough.
 */
export function runModerationInBackground(pitchId) {
  // Best-effort — the reconciler cron is the durable fallback.
  runModeration(pitchId).catch((err) => {
    console.error("[moderation.pipeline] background run failed", {
      pitchId,
      error: err.message,
    });
  });
}

/**
 * Mark a pitch as queued so the reconciler will pick it up. Used by API
 * routes right after they insert / update the pitch row, before returning
 * to the client. Idempotent.
 */
export async function enqueueForModeration(pitchId, { source } = {}) {
  const supabase = getSupabaseAdmin();
  const { data: updated } = await supabase
    .from("pitches")
    .update({
      moderation_state: MODERATION_STATE.QUEUED,
      moderation_source: source || null,
      moderation_next_attempt_at: new Date().toISOString(),
      moderation_last_error: null,
    })
    .eq("id", pitchId)
    // Only transition non-terminal rows into queued. Never bump a row that
    // is already approved / rejected / needs_review.
    .in("moderation_state", [MODERATION_STATE.NOT_STARTED, MODERATION_STATE.FAILED])
    .select("id")
    .maybeSingle();
  return updated || null;
}

// ─── Orchestration ────────────────────────────────────────────────────

async function orchestrate(pitch, supabase) {
  const fileType = classifyFile(pitch);
  switch (fileType) {
    case "video": return orchestrateVideo(pitch, supabase);
    case "audio-mux":
    case "audio-storage":
      return orchestrateAudio(pitch, supabase);
    case "text-doc": return orchestrateTextDoc(pitch, supabase);
    default: return orchestrateText(pitch, supabase);
  }
}

function classifyFile(pitch) {
  if (pitch.file_type === "video") return "video";
  if (pitch.file_type === "audio") return "audio-mux";
  if (pitch.mux_asset_id) return "video";
  const name = (pitch.file_name || "").toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|aac|weba|flac)$/.test(name)) return "audio-storage";
  if (/\.(pdf|docx|doc|txt)$/.test(name)) return "text-doc";
  return "text";
}

// ---- Text ----
async function orchestrateText(pitch) {
  const combined = joinText(pitch.title, pitch.description, pitch.text_content);
  const result = await moderateTextWithUmgpt({ text: combined, kind: "text" });
  return combineDecisions([{ channel: "text", result, required: true }]);
}

async function orchestrateTextDoc(pitch) {
  const extracted = await extractDocText(pitch);
  const combined = joinText(pitch.title, pitch.description, extracted, pitch.text_content);
  const result = await moderateTextWithUmgpt({ text: combined, kind: "text-doc" });
  const outcome = combineDecisions([{ channel: "text", result, required: true }]);
  outcome.extractedText = extracted;
  return outcome;
}

// ---- Audio (Supabase-storage fallback) ----
// If the user uploaded audio directly to Supabase Storage (legacy path),
// we can't reliably transcribe it server-side. Route to human review with
// a clear reason so admins know why.
async function orchestrateAudio(pitch, supabase) {
  const cls = classifyFile(pitch);
  if (cls === "audio-mux") {
    return orchestrateVideo(pitch, supabase); // shares transcript + Robots flow
  }
  const meta = joinText(pitch.title, pitch.description);
  const metaResult = await moderateTextWithUmgpt({ text: meta, kind: "text" });
  // Force needs_review — we do not have a transcript to moderate against.
  const forcedTranscript = {
    decision: "needs_review",
    summary: "Audio file was uploaded outside of Mux and cannot be transcribed automatically. Held for human review.",
    categories: [],
    guidebookViolations: [],
    provider: PROVIDER.UMGPT_TRANSCRIPT,
    completedAt: new Date().toISOString(),
  };
  return combineDecisions([
    { channel: "text", result: metaResult, required: true },
    { channel: "transcript", result: forcedTranscript, required: true },
  ]);
}

// ---- Video (and audio-via-Mux) ----
async function orchestrateVideo(pitch, supabase) {
  const config = getModerationConfig();

  // 1) Metadata moderation — always runs.
  const metaText = joinText(pitch.title, pitch.description);
  const textResult = await moderateTextWithUmgpt({ text: metaText, kind: "text" });

  if (!pitch.mux_asset_id) {
    // Video row without a Mux asset — treat as still uploading.
    return combineDecisions([
      { channel: "text", result: textResult, required: true },
      { channel: "transcript", result: null, required: true },
      { channel: "visual", result: null, required: true },
    ]);
  }

  // 2) Transcript retrieval/moderation and 3) Mux Robots visual moderation.
  // Give both channels a short chance to settle inside the current request so
  // preview deployments and webhook-triggered runs do not depend entirely on
  // cron just to escape `processing`.
  let transcriptResult = null;
  let transcriptRecord = {
    status: pitch.transcript_status,
    text: pitch.transcript,
    language: pitch.transcript_language,
    error: pitch.transcript_last_error,
  };
  let visualResult = null;
  const settleDeadline = Date.now() + VIDEO_SETTLE_WINDOW_MS;

  do {
    if (!transcriptResult) {
      const nextTranscript = await resolveTranscriptModeration(pitch, supabase, transcriptRecord);
      transcriptRecord = nextTranscript.record;
      transcriptResult = nextTranscript.result;
    }

    if (!visualResult) {
      visualResult = config.features.muxRobotsEnabled
        ? await runOrPollVisual(pitch, supabase)
        : buildVisualDisabledResult();
    }

    if (transcriptResult && visualResult) break;
    if (Date.now() >= settleDeadline) break;

    await sleep(VIDEO_POLL_INTERVAL_MS);
  } while (true);

  if (!visualResult && !config.features.muxRobotsEnabled) {
    visualResult = buildVisualDisabledResult();
  }

  const outcome = combineDecisions([
    { channel: "text", result: textResult, required: true },
    { channel: "transcript", result: transcriptResult, required: true },
    { channel: "visual", result: visualResult, required: true },
  ]);
  return outcome;
}

async function runOrPollVisual(pitch, supabase) {
  // Start a new job if we don't have one yet.
  if (!pitch.mux_moderation_job_id) {
    try {
      const { jobId } = await startVisualModeration(pitch.mux_asset_id, {
        passthrough: pitch.id,
      });
      await supabase.from("pitches").update({
        mux_moderation_job_id: jobId,
        visual_moderation_status: MODERATION_STATE.PROCESSING,
      }).eq("id", pitch.id);
      pitch.mux_moderation_job_id = jobId;
    } catch (err) {
      console.warn("[moderation.pipeline] visual job start failed", {
        pitchId: pitch.id, error: err.message,
      });
      if (isRetryable(err) &&
          (pitch.moderation_attempt_count || 1) <= VISUAL_START_RETRYABLE_ATTEMPTS) {
        // Give transient provider/network failures one retry window before we
        // fall back to human review.
        return null;
      }
      return buildVisualUnavailableResult(err.message);
    }
  }

  const job = await fetchVisualModerationJob(pitch.mux_moderation_job_id);
  if (job.status === "pending" || job.status === "processing") {
    return null; // signal: still running
  }
  const normalized = normalizeVisualModerationResult(job);
  return normalized;
}

async function resolveTranscriptModeration(pitch, supabase, transcriptRecord) {
  let nextRecord = transcriptRecord || {};

  if (nextRecord.status !== TRANSCRIPT_STATUS.READY &&
      nextRecord.status !== TRANSCRIPT_STATUS.NOT_APPLICABLE) {
    const fetched = await fetchMuxTranscript(pitch.mux_asset_id, pitch.mux_playback_id);
    nextRecord = {
      status: fetched.status,
      text: fetched.text || null,
      language: fetched.language || null,
      error: fetched.error || null,
    };
    await supabase.from("pitches").update({
      transcript: nextRecord.text,
      transcript_status: nextRecord.status,
      transcript_language: nextRecord.language,
      transcript_last_error: nextRecord.error,
    }).eq("id", pitch.id);
  }

  if (nextRecord.status === TRANSCRIPT_STATUS.READY && nextRecord.text) {
    return {
      record: nextRecord,
      result: await moderateTextWithUmgpt({
        text: nextRecord.text,
        kind: "transcript",
      }),
    };
  }

  if (nextRecord.status === TRANSCRIPT_STATUS.NOT_APPLICABLE) {
    return {
      record: nextRecord,
      result: {
        decision: "approved",
        summary: "No speech detected; transcript moderation is not applicable.",
        categories: [],
        guidebookViolations: [],
        provider: PROVIDER.UMGPT_TRANSCRIPT,
        completedAt: new Date().toISOString(),
      },
    };
  }

  if (nextRecord.status === TRANSCRIPT_STATUS.PROCESSING ||
      nextRecord.status === TRANSCRIPT_STATUS.NOT_STARTED) {
    if (shouldHoldForMissingTranscript(pitch)) {
      const error = "Mux captions were not generated after multiple attempts.";
      await supabase.from("pitches").update({
        transcript_status: TRANSCRIPT_STATUS.FAILED,
        transcript_last_error: error,
      }).eq("id", pitch.id);
      nextRecord = {
        ...nextRecord,
        status: TRANSCRIPT_STATUS.FAILED,
        error,
      };
      return {
        record: nextRecord,
        result: {
          decision: "needs_review",
          summary: `${error} Held for human review.`,
          categories: [],
          guidebookViolations: [],
          provider: PROVIDER.UMGPT_TRANSCRIPT,
          completedAt: new Date().toISOString(),
        },
      };
    }
    return { record: nextRecord, result: null };
  }

  return {
    record: nextRecord,
    result: {
      decision: "needs_review",
      summary: `Transcript unavailable (${nextRecord.error || nextRecord.status}). Held for human review.`,
      categories: [],
      guidebookViolations: [],
      provider: PROVIDER.UMGPT_TRANSCRIPT,
      completedAt: new Date().toISOString(),
    },
  };
}

function buildVisualDisabledResult() {
  return {
    decision: "needs_review",
    summary: "Mux Robots visual moderation is disabled. Held for human review of the video.",
    categories: [],
    guidebookViolations: [],
    provider: PROVIDER.MUX_ROBOTS_VISUAL,
    completedAt: new Date().toISOString(),
  };
}

function buildVisualUnavailableResult(errorMessage) {
  return {
    decision: "needs_review",
    summary: `Mux visual moderation could not be started (${errorMessage || "unknown error"}). Held for human review.`,
    categories: [],
    guidebookViolations: [],
    provider: PROVIDER.MUX_ROBOTS_VISUAL,
    completedAt: new Date().toISOString(),
  };
}

// ─── Persistence ──────────────────────────────────────────────────────

async function persistTerminal(supabase, pitch, outcome) {
  const now = new Date().toISOString();
  const components = outcome.components || {};

  // If the combiner says PROCESSING, we schedule a retry rather than
  // moving to a terminal state.
  if (outcome.finalState === MODERATION_STATE.PROCESSING) {
    const attemptCount = (pitch.moderation_attempt_count || 0) + 1;
    if (!hasBudgetLeft(attemptCount - 1)) {
      // Out of retries — hold for review.
      await supabase.from("pitches").update({
        moderation_state: MODERATION_STATE.NEEDS_REVIEW,
        moderation_summary: "Moderation exceeded retry budget while still processing. Held for review.",
        moderation_completed_at: now,
      }).eq("id", pitch.id);
      await writeAudit(supabase, {
        pitchId: pitch.id,
        action: "auto_needs_review",
        previousState: MODERATION_STATE.PROCESSING,
        newState: MODERATION_STATE.NEEDS_REVIEW,
        reason: "Exceeded retry budget while sub-components still processing.",
      });
      return;
    }
    await supabase.from("pitches").update({
      moderation_state: MODERATION_STATE.QUEUED,
      moderation_summary: outcome.summary,
      moderation_next_attempt_at: computeNextAttemptAt(attemptCount),
      visual_moderation_status: pendingComponentState(components.visual),
      visual_moderation_result: components.visual?.result || null,
      transcript_moderation_status: pendingComponentState(components.transcript),
      transcript_moderation_result: components.transcript?.result || null,
    }).eq("id", pitch.id);
    return;
  }

  const update = {
    moderation_state: outcome.finalState,
    moderation_summary: outcome.summary,
    moderation_completed_at: now,
    moderation_reasons: outcome.guidebook_violations,
    moderation_categories: uniqueCategories(components),
    moderation_scores: extractScores(components),
    visual_moderation_status: componentState(components.visual),
    visual_moderation_result: components.visual?.result || null,
    transcript_moderation_status: componentState(components.transcript),
    transcript_moderation_result: components.transcript?.result || null,
    mux_moderation_result: components.visual?.result?.providerRaw || null,
    // Keep the v1 columns in sync so the existing admin UI keeps working.
    moderation_status: mapStateToV1(outcome.finalState),
    moderation_reason: outcome.summary,
    moderation_flags: buildV1Flags(components),
    moderation_priority: outcome.finalState === MODERATION_STATE.NEEDS_REVIEW ? 100 : 0,
    moderation_checked_at: now,
    moderation_next_attempt_at: null,
    moderation_last_error: null,
  };
  await supabase.from("pitches").update(update).eq("id", pitch.id);

  await writeAudit(supabase, {
    pitchId: pitch.id,
    action:
      outcome.finalState === MODERATION_STATE.APPROVED ? "auto_approved" :
      outcome.finalState === MODERATION_STATE.NEEDS_REVIEW ? "auto_needs_review" :
      outcome.finalState === MODERATION_STATE.REJECTED ? "auto_rejected" :
      "auto_failed",
    previousState: MODERATION_STATE.PROCESSING,
    newState: outcome.finalState,
    reason: outcome.summary,
    details: { flagged_categories: outcome.flagged_categories },
  });
}

async function handleFailure(supabase, pitchId, err) {
  const supabase2 = supabase; // alias
  const { data: current } = await supabase2
    .from("pitches")
    .select("moderation_attempt_count, moderation_state")
    .eq("id", pitchId)
    .single();
  const attemptsMade = current?.moderation_attempt_count || 1;

  if (isRetryable(err) && hasBudgetLeft(attemptsMade)) {
    await supabase2.from("pitches").update({
      moderation_state: MODERATION_STATE.QUEUED,
      moderation_last_error: truncate(err.message, 500),
      moderation_next_attempt_at: computeNextAttemptAt(attemptsMade + 1),
    }).eq("id", pitchId);
    return;
  }
  // Terminal failure — hold for review, don't auto-reject.
  await supabase2.from("pitches").update({
    moderation_state: MODERATION_STATE.NEEDS_REVIEW,
    moderation_summary: `Moderation failed: ${truncate(err.message, 200)} — held for human review.`,
    moderation_last_error: truncate(err.message, 500),
    moderation_completed_at: new Date().toISOString(),
    // v1 mirror.
    moderation_status: "flagged",
    moderation_reason: truncate(err.message, 200),
    moderation_priority: 100,
    moderation_checked_at: new Date().toISOString(),
  }).eq("id", pitchId);

  await writeAudit(supabase2, {
    pitchId,
    action: "auto_failed",
    previousState: MODERATION_STATE.PROCESSING,
    newState: MODERATION_STATE.NEEDS_REVIEW,
    reason: err.message,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────
function joinText(...parts) {
  return parts.filter(Boolean).map((s) => String(s).trim()).filter(Boolean).join("\n\n");
}

function componentState(component) {
  if (!component || !component.result) return "not_applicable";
  return mapDecisionToState(component.result.decision);
}

function pendingComponentState(component) {
  if (!component) return "not_applicable";
  if (!component.result) return MODERATION_STATE.PROCESSING;
  return mapDecisionToState(component.result.decision);
}

function mapDecisionToState(decision) {
  switch (decision) {
    case "approved": return MODERATION_STATE.APPROVED;
    case "needs_review": return MODERATION_STATE.NEEDS_REVIEW;
    case "rejected": return MODERATION_STATE.REJECTED;
    case "failed": return MODERATION_STATE.FAILED;
    default: return MODERATION_STATE.PROCESSING;
  }
}

function uniqueCategories(components) {
  const flat = [];
  for (const key of Object.keys(components)) {
    const cats = components[key]?.result?.categories || [];
    for (const c of cats) flat.push({ channel: key, ...c });
  }
  return flat;
}

function extractScores(components) {
  const scores = {};
  const visual = components.visual?.result?.providerRaw?.max_scores;
  if (visual) scores.visual = visual;
  return scores;
}

// Mirror the v2 state onto the v1 `moderation_status` column so the existing
// admin dashboard, gallery, and any other code that filters on the old
// column continues to work during the transition.
function mapStateToV1(state) {
  switch (state) {
    case MODERATION_STATE.APPROVED: return "approved";
    case MODERATION_STATE.REJECTED: return "rejected";
    case MODERATION_STATE.NEEDS_REVIEW: return "flagged";
    case MODERATION_STATE.FAILED: return "errored";
    case MODERATION_STATE.PROCESSING:
    case MODERATION_STATE.QUEUED:
    case MODERATION_STATE.NOT_STARTED:
    default: return "pending";
  }
}

function buildV1Flags(components) {
  const flags = [];
  for (const [channel, comp] of Object.entries(components)) {
    for (const c of (comp?.result?.categories || [])) {
      if (!c.flagged) continue;
      flags.push({
        source: channel,
        category: c.category,
        severity: c.severity || null,
        reason: c.explanation || "",
        excerpt: (c.evidence && c.evidence[0]) || null,
        timestamps: c.timestamps || null,
      });
    }
  }
  return flags;
}

function truncate(s, n) {
  if (!s) return s;
  const str = String(s);
  return str.length <= n ? str : str.slice(0, n) + "...";
}

function shouldHoldForMissingTranscript(pitch) {
  const attempts = pitch.moderation_attempt_count || 0;
  if (attempts < TRANSCRIPT_MAX_PENDING_ATTEMPTS) return false;
  const createdAt = pitch.created_at ? new Date(pitch.created_at).getTime() : 0;
  if (!createdAt) return false;
  return (Date.now() - createdAt) >= TRANSCRIPT_WAIT_GRACE_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Media state helper for the webhook ───────────────────────────────
/** Update just the media_status column safely. */
export async function markMediaStatus(pitchId, status, extras = {}) {
  const supabase = getSupabaseAdmin();
  await supabase.from("pitches").update({
    media_status: status,
    ...extras,
  }).eq("id", pitchId);
}

export { MEDIA_STATUS, MODERATION_STATE, classifyFile };
