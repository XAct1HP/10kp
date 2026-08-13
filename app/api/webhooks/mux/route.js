import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient, getMuxWebhookSecret } from "../../../../lib/mux";
import {
  enqueueForModeration,
  runModeration,
} from "../../../../lib/moderation/pipeline";
import { MEDIA_STATUS } from "../../../../lib/moderation/types";
import {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
} from "../../../../lib/moderation/webhook-idempotency";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Helpers ──────────────────────────────────────────────────────────

function getEventIdentifiers(event) {
  const data = event.data || {};
  const eventType = typeof event.type === "string" ? event.type : "";
  const isUploadEvent = eventType.startsWith("video.upload.");

  return {
    uploadId: isUploadEvent ? data.id || data.upload_id || null : data.upload_id || null,
    assetId: isUploadEvent ? data.asset_id || null : data.id || data.asset_id || null,
    playbackId: data.playback_ids?.[0]?.id || null,
    passthrough:
      data.passthrough ||
      data.new_asset_settings?.passthrough ||
      data.meta?.pitch_id ||
      data.meta?.submission_id ||
      data.meta?.external_id ||
      null,
  };
}

function getMuxErrorMessage(data) {
  const type = data?.errors?.type || null;
  const messages = Array.isArray(data?.errors?.messages)
    ? data.errors.messages.filter(Boolean).join("; ")
    : null;
  return [type, messages].filter(Boolean).join(": ") || "Mux processing error.";
}

function isUuidLike(value) {
  return typeof value === "string"
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    : false;
}

function safeParseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

async function findPitchByColumn(supabaseAdmin, column, value) {
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select("id, mux_upload_id, mux_asset_id, mux_playback_id, mux_status, mux_error, media_status, is_seed")
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up pitch by ${column}: ${error.message}`);
  return data || null;
}

async function resolvePitch(event, supabaseAdmin) {
  const identifiers = getEventIdentifiers(event);
  if (identifiers.assetId) {
    const pitch = await findPitchByColumn(supabaseAdmin, "mux_asset_id", identifiers.assetId);
    if (pitch) return { pitch, identifiers, matchedBy: "mux_asset_id" };
  }
  if (identifiers.uploadId) {
    const pitch = await findPitchByColumn(supabaseAdmin, "mux_upload_id", identifiers.uploadId);
    if (pitch) return { pitch, identifiers, matchedBy: "mux_upload_id" };
  }
  // Passthrough is client-supplied — only trust UUIDs, and only after the
  // asset-id / upload-id fallbacks have failed. This prevents a spoofed
  // passthrough from redirecting a webhook to another user's pitch.
  if (isUuidLike(identifiers.passthrough)) {
    const pitch = await findPitchByColumn(supabaseAdmin, "id", identifiers.passthrough);
    if (pitch) return { pitch, identifiers, matchedBy: "passthrough" };
  }
  return { pitch: null, identifiers, matchedBy: null };
}

async function ensurePlaybackId(mux, assetId, playbackId) {
  if (playbackId || !assetId) return playbackId || null;
  try {
    const created = await mux.video.assets.createPlaybackId(assetId, { policy: "public" });
    return created?.id || null;
  } catch (error) {
    console.error("[mux.webhook] failed to create fallback playback ID", {
      assetId, error: error.message,
    });
    return null;
  }
}

async function writeWebhookLog(supabaseAdmin, entry) {
  try {
    await supabaseAdmin.from("mux_webhook_logs").insert(entry);
  } catch (error) {
    console.error("[mux.webhook] failed to persist webhook log", { error: error.message });
  }
}

function buildWebhookLog({ status, message, event, identifiers, pitch, matchedBy, payload }) {
  return {
    event_type: event?.type || payload?.type || null,
    status,
    upload_id: identifiers?.uploadId || null,
    asset_id: identifiers?.assetId || null,
    playback_id: identifiers?.playbackId || pitch?.mux_playback_id || null,
    passthrough: identifiers?.passthrough || null,
    matched_pitch_id: pitch?.id || null,
    matched_by: matchedBy || null,
    message,
    payload: payload || event || null,
  };
}

async function updatePitch(supabaseAdmin, pitchId, update) {
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .update(update)
    .eq("id", pitchId)
    .select("id, mux_upload_id, mux_asset_id, mux_playback_id, mux_status, mux_error, media_status, is_seed")
    .single();
  if (error) throw new Error(`Failed to update pitch ${pitchId}: ${error.message}`);
  return data;
}

async function kickModeration(pitchId, source) {
  await enqueueForModeration(pitchId, { source });
  try {
    await runModeration(pitchId);
  } catch (error) {
    console.warn("[mux.webhook] moderation run did not finish inline", {
      pitchId,
      source,
      error: error.message,
    });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────
export async function POST(request) {
  const rawBody = await request.text();
  const parsedPayload = safeParseJson(rawBody);
  const supabaseAdmin = getSupabaseAdmin();

  // Signature verification — MUST run against the raw body, not the parsed
  // JSON. Fail closed with 400 if invalid.
  let event;
  try {
    const mux = getMuxClient();
    const webhookSecret = getMuxWebhookSecret();
    event = await mux.webhooks.unwrap(rawBody, request.headers, webhookSecret);
  } catch (error) {
    await writeWebhookLog(supabaseAdmin, buildWebhookLog({
      status: "invalid_signature",
      message: error.message,
      identifiers: parsedPayload ? getEventIdentifiers(parsedPayload) : {},
      payload: parsedPayload,
    }));
    console.warn("[mux.webhook] invalid signature", { error: error.message });
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Idempotency claim — a duplicate delivery short-circuits with 200.
  const eventHeaderId = request.headers.get("mux-signature")?.split(",")?.[0]?.split("=")?.[1]
    || event.id
    || event.data?.id
    || null;
  const claim = await claimWebhookEvent("mux", eventHeaderId, event.type, event);
  if (claim.alreadyProcessed) {
    // Duplicate — Mux occasionally re-delivers. Ack politely.
    return NextResponse.json({ message: "ok", duplicate: true });
  }

  try {
    const mux = getMuxClient();
    const { pitch, identifiers, matchedBy } = await resolvePitch(event, supabaseAdmin);

    if (!pitch) {
      await writeWebhookLog(supabaseAdmin, buildWebhookLog({
        status: "no_match",
        message: "No row matched by mux_asset_id, mux_upload_id, or passthrough pitch id.",
        event, identifiers, matchedBy,
      }));
      await markWebhookProcessed(claim.id, { processing_status: "ignored" });
      return NextResponse.json({ message: "ok" });
    }

    switch (event.type) {
      case "video.upload.asset_created": {
        const updated = await updatePitch(supabaseAdmin, pitch.id, {
          mux_upload_id: identifiers.uploadId || pitch.mux_upload_id,
          mux_asset_id: identifiers.assetId || pitch.mux_asset_id,
          mux_status: pitch.mux_playback_id ? "ready" : "processing",
          media_status: pitch.mux_playback_id ? MEDIA_STATUS.READY : MEDIA_STATUS.PROCESSING,
          mux_error: pitch.mux_playback_id ? null : pitch.mux_error,
        });
        await writeWebhookLog(supabaseAdmin, buildWebhookLog({
          status: "updated",
          message: "Stored mux_asset_id from video.upload.asset_created.",
          event, identifiers: { ...identifiers, playbackId: updated.mux_playback_id },
          pitch: updated, matchedBy,
        }));
        break;
      }

      case "video.asset.ready": {
        const playbackId = await ensurePlaybackId(
          mux,
          identifiers.assetId || pitch.mux_asset_id,
          identifiers.playbackId || pitch.mux_playback_id
        );
        const missingPlaybackMsg = "Mux asset is ready, but no playback ID is available for gallery playback.";
        const updated = await updatePitch(supabaseAdmin, pitch.id, {
          mux_upload_id: identifiers.uploadId || pitch.mux_upload_id,
          mux_asset_id: identifiers.assetId || pitch.mux_asset_id,
          mux_playback_id: playbackId || pitch.mux_playback_id,
          mux_status: "ready",
          media_status: MEDIA_STATUS.READY,
          mux_error: playbackId || pitch.mux_playback_id ? null : missingPlaybackMsg,
        });
        await writeWebhookLog(supabaseAdmin, buildWebhookLog({
          status: playbackId || updated.mux_playback_id ? "updated" : "ready_missing_playback",
          message: playbackId || updated.mux_playback_id
            ? "Stored ready asset and playback ID."
            : missingPlaybackMsg,
          event, identifiers: { ...identifiers, playbackId: playbackId || updated.mux_playback_id },
          pitch: updated, matchedBy,
        }));
        if ((playbackId || updated.mux_playback_id) && !pitch.is_seed) {
          // Seed pitches (past-year winners uploaded by admins) skip
          // moderation entirely — they're pre-approved on insert.
          // Persist moderation progress before this invocation exits so the
          // row does not get stranded in `processing` if background work is
          // cut off by the serverless runtime.
          await kickModeration(updated.id, "mux_webhook_asset_ready");
        }
        break;
      }

      case "video.asset.errored":
      case "video.upload.errored": {
        // Never overwrite a healthy ready asset with a stale errored event.
        if (pitch.mux_playback_id) {
          await writeWebhookLog(supabaseAdmin, buildWebhookLog({
            status: "skipped_errored",
            message: "Skipped errored update because the pitch already has a playback ID.",
            event, identifiers: { ...identifiers, playbackId: pitch.mux_playback_id },
            pitch, matchedBy,
          }));
          break;
        }
        const updated = await updatePitch(supabaseAdmin, pitch.id, {
          mux_upload_id: identifiers.uploadId || pitch.mux_upload_id,
          mux_asset_id: identifiers.assetId || pitch.mux_asset_id,
          mux_status: "errored",
          media_status: MEDIA_STATUS.ERRORED,
          mux_error: getMuxErrorMessage(event.data),
        });
        await writeWebhookLog(supabaseAdmin, buildWebhookLog({
          status: "updated",
          message: updated.mux_error || "Stored errored asset state.",
          event, identifiers, pitch: updated, matchedBy,
        }));
        break;
      }

      case "video.asset.track.ready": {
        // A caption track finished generating. Re-run moderation so the
        // transcript channel picks it up on the next attempt. Seed
        // pitches skip moderation, so this is a no-op for them.
        if (pitch.mux_playback_id && !pitch.is_seed) {
          await kickModeration(pitch.id, "mux_webhook_track_ready");
        }
        await writeWebhookLog(supabaseAdmin, buildWebhookLog({
          status: "track_ready",
          message: "Caption track ready — re-queued moderation.",
          event, identifiers, pitch, matchedBy,
        }));
        break;
      }

      default:
        await writeWebhookLog(supabaseAdmin, buildWebhookLog({
          status: "ignored",
          message: "Received an unsupported Mux event type.",
          event, identifiers, pitch, matchedBy,
        }));
        break;
    }

    await markWebhookProcessed(claim.id);
    return NextResponse.json({ message: "ok" });
  } catch (error) {
    await writeWebhookLog(supabaseAdmin, buildWebhookLog({
      status: "handler_error",
      message: error.message,
      identifiers: parsedPayload ? getEventIdentifiers(parsedPayload) : {},
      payload: parsedPayload,
    }));
    await markWebhookFailed(claim.id, error.message);
    console.error("[mux.webhook] handler failed", { error: error.message });
    // Return 500 so Mux retries with backoff. The idempotency table will
    // treat the next delivery as a retry (not a duplicate) because the
    // current row is marked `failed`.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
