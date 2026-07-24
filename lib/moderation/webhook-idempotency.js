// Webhook idempotency helper.
//
// Every inbound webhook is recorded in `moderation_webhook_events` with a
// unique (provider, event_id) pair. Duplicate deliveries return
// `alreadyProcessed:true` so the caller can 200-ack and skip side effects.
//
// Retry semantics: a row whose previous attempt did NOT reach a terminal
// success state (`processed` / `ignored`) is eligible for re-processing.
// This handles the case where the first delivery timed out mid-handler
// and Mux re-sent the event.

import { getSupabaseAdmin } from "../supabase.js";

const UNIQUE_VIOLATION = "23505";

/**
 * Claim ownership of a webhook event for processing.
 *
 * @param {string} provider e.g. "mux"
 * @param {string|null} eventId Provider-supplied event ID.
 * @param {string|null} eventType
 * @param {any} payload Raw parsed payload.
 * @returns {Promise<{id?:string, alreadyProcessed:boolean, attempt:number}>}
 */
export async function claimWebhookEvent(provider, eventId, eventType, payload) {
  const supabase = getSupabaseAdmin();

  // No event ID → not de-duplicable. Store an audit row and let the caller
  // proceed. Pipeline-level idempotency (per-pitch state guards) still
  // protects the database.
  if (!eventId) {
    const { data } = await supabase
      .from("moderation_webhook_events")
      .insert({
        provider,
        event_id: `synthetic:${cryptoRandomId()}`,
        event_type: eventType || null,
        processing_status: "processing",
        attempt_count: 1,
        payload: payload || null,
      })
      .select("id")
      .maybeSingle();
    return { id: data?.id, alreadyProcessed: false, attempt: 1 };
  }

  // Fast path — first delivery. Try an insert.
  const { data: inserted, error: insertErr } = await supabase
    .from("moderation_webhook_events")
    .insert({
      provider,
      event_id: eventId,
      event_type: eventType || null,
      processing_status: "processing",
      attempt_count: 1,
      payload: payload || null,
    })
    .select("id")
    .single();

  if (!insertErr) {
    return { id: inserted.id, alreadyProcessed: false, attempt: 1 };
  }

  // Unique violation → look up the existing row and decide whether to
  // treat this as a duplicate or as a retry attempt.
  if (insertErr.code === UNIQUE_VIOLATION) {
    const { data: existing, error: readErr } = await supabase
      .from("moderation_webhook_events")
      .select("id, processing_status, attempt_count")
      .eq("provider", provider)
      .eq("event_id", eventId)
      .single();
    if (readErr || !existing) {
      // Shouldn't happen — treat as processed to avoid duplicating work.
      return { alreadyProcessed: true, attempt: 0 };
    }
    if (existing.processing_status === "processed" ||
        existing.processing_status === "ignored") {
      return { id: existing.id, alreadyProcessed: true, attempt: existing.attempt_count };
    }
    // Previous attempt failed or is stuck in `processing`/`received`.
    // Reserve for another attempt.
    const nextAttempt = (existing.attempt_count || 0) + 1;
    await supabase
      .from("moderation_webhook_events")
      .update({
        processing_status: "processing",
        attempt_count: nextAttempt,
        last_error: null,
      })
      .eq("id", existing.id);
    return { id: existing.id, alreadyProcessed: false, attempt: nextAttempt };
  }

  // Non-idempotency error — don't block the webhook. Log and continue.
  console.error("[webhook.idempotency] insert failed", {
    provider, eventId, code: insertErr.code, message: insertErr.message,
  });
  return { alreadyProcessed: false, attempt: 1 };
}

/** Mark a webhook event as processed (success). */
export async function markWebhookProcessed(eventRowId, extras = {}) {
  if (!eventRowId) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("moderation_webhook_events")
    .update({
      processing_status: extras.processing_status || "processed",
      processed_at: new Date().toISOString(),
      ...extras,
    })
    .eq("id", eventRowId);
}

/** Mark a webhook event as failed. Next Mux delivery of the same event
 *  ID will be treated as a retry, not a duplicate. */
export async function markWebhookFailed(eventRowId, errMessage) {
  if (!eventRowId) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("moderation_webhook_events")
    .update({
      processing_status: "failed",
      processed_at: new Date().toISOString(),
      last_error: String(errMessage || "unknown error").slice(0, 500),
    })
    .eq("id", eventRowId);
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
