import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient, getMuxWebhookSecret } from "../../../../lib/mux";

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
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
    : false;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function findPitchByColumn(supabaseAdmin, column, value) {
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select("id, mux_upload_id, mux_asset_id, mux_playback_id, mux_status, mux_error")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up pitch by ${column}: ${error.message}`);
  }

  return data || null;
}

async function resolvePitch(event, supabaseAdmin) {
  const identifiers = getEventIdentifiers(event);

  if (identifiers.assetId) {
    const pitch = await findPitchByColumn(supabaseAdmin, "mux_asset_id", identifiers.assetId);
    if (pitch) {
      return { pitch, identifiers, matchedBy: "mux_asset_id" };
    }
  }

  if (identifiers.uploadId) {
    const pitch = await findPitchByColumn(supabaseAdmin, "mux_upload_id", identifiers.uploadId);
    if (pitch) {
      return { pitch, identifiers, matchedBy: "mux_upload_id" };
    }
  }

  if (isUuidLike(identifiers.passthrough)) {
    const pitch = await findPitchByColumn(supabaseAdmin, "id", identifiers.passthrough);
    if (pitch) {
      return { pitch, identifiers, matchedBy: "passthrough" };
    }
  }

  return { pitch: null, identifiers, matchedBy: null };
}

async function ensurePlaybackId(mux, assetId, playbackId) {
  if (playbackId || !assetId) {
    return playbackId || null;
  }

  try {
    const createdPlayback = await mux.video.assets.createPlaybackId(assetId, {
      policy: "public",
    });

    return createdPlayback?.id || null;
  } catch (error) {
    console.error("[Mux webhook] failed to create fallback playback ID", {
      assetId,
      error: error.message,
    });
    return null;
  }
}

async function updatePitch(supabaseAdmin, pitchId, update) {
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .update(update)
    .eq("id", pitchId)
    .select("id, mux_upload_id, mux_asset_id, mux_playback_id, mux_status, mux_error")
    .single();

  if (error) {
    throw new Error(`Failed to update pitch ${pitchId}: ${error.message}`);
  }

  return data;
}

async function writeWebhookLog(supabaseAdmin, entry) {
  try {
    await supabaseAdmin.from("mux_webhook_logs").insert(entry);
  } catch (error) {
    console.error("[Mux webhook] failed to persist webhook log", {
      error: error.message,
    });
  }
}

function buildWebhookLog({
  status,
  message,
  event,
  identifiers,
  pitch,
  matchedBy,
  payload,
}) {
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

export async function POST(request) {
  const rawBody = await request.text();
  const parsedPayload = safeParseJson(rawBody);
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const mux = getMuxClient();
    const webhookSecret = getMuxWebhookSecret();

    let event;
    try {
      event = await mux.webhooks.unwrap(rawBody, request.headers, webhookSecret);
    } catch (error) {
      const parsedIdentifiers = parsedPayload
        ? getEventIdentifiers(parsedPayload)
        : {
            uploadId: null,
            assetId: null,
            playbackId: null,
            passthrough: null,
          };

      await writeWebhookLog(
        supabaseAdmin,
        buildWebhookLog({
          status: "invalid_signature",
          message: error.message,
          identifiers: parsedIdentifiers,
          payload: parsedPayload,
        })
      );

      console.warn("[Mux webhook] invalid signature", {
        error: error.message,
      });
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const { pitch, identifiers, matchedBy } = await resolvePitch(event, supabaseAdmin);

    console.info("[Mux webhook] received", {
      eventType: event.type,
      uploadId: identifiers.uploadId,
      assetId: identifiers.assetId,
      playbackId: identifiers.playbackId,
      passthrough: identifiers.passthrough,
      matchedPitchId: pitch?.id || null,
      matchedBy,
    });

    if (!pitch) {
      await writeWebhookLog(
        supabaseAdmin,
        buildWebhookLog({
          status: "no_match",
          message: "No row matched by mux_asset_id, mux_upload_id, or passthrough pitch id.",
          event,
          identifiers,
          matchedBy,
        })
      );

      console.warn("[Mux webhook] no matching pitch row", {
        eventType: event.type,
        uploadId: identifiers.uploadId,
        assetId: identifiers.assetId,
        playbackId: identifiers.playbackId,
        passthrough: identifiers.passthrough,
        reason: "No row matched by mux_asset_id, mux_upload_id, or passthrough pitch id.",
      });
      return NextResponse.json({ message: "ok" });
    }

    if (event.type === "video.upload.asset_created") {
      const updatedPitch = await updatePitch(supabaseAdmin, pitch.id, {
        mux_upload_id: identifiers.uploadId || pitch.mux_upload_id,
        mux_asset_id: identifiers.assetId || pitch.mux_asset_id,
        mux_status: pitch.mux_playback_id ? "ready" : "processing",
        mux_error: pitch.mux_playback_id ? null : pitch.mux_error,
      });

      console.info("[Mux webhook] updated pitch", {
        eventType: event.type,
        matchedPitchId: pitch.id,
        updateResult: updatedPitch,
      });

      await writeWebhookLog(
        supabaseAdmin,
        buildWebhookLog({
          status: "updated",
          message: "Stored mux_asset_id from video.upload.asset_created.",
          event,
          identifiers: {
            ...identifiers,
            playbackId: updatedPitch.mux_playback_id,
          },
          pitch: updatedPitch,
          matchedBy,
        })
      );
    } else if (event.type === "video.asset.ready") {
      const playbackId = await ensurePlaybackId(
        mux,
        identifiers.assetId || pitch.mux_asset_id,
        identifiers.playbackId || pitch.mux_playback_id
      );
      const readyWithoutPlaybackMessage =
        "Mux asset is ready, but no playback ID is available for gallery playback.";
      const updatedPitch = await updatePitch(supabaseAdmin, pitch.id, {
        mux_upload_id: identifiers.uploadId || pitch.mux_upload_id,
        mux_asset_id: identifiers.assetId || pitch.mux_asset_id,
        mux_playback_id: playbackId || pitch.mux_playback_id,
        mux_status: "ready",
        mux_error: playbackId || pitch.mux_playback_id ? null : readyWithoutPlaybackMessage,
      });

      if (!playbackId && !pitch.mux_playback_id) {
        console.error("[Mux webhook] ready asset missing playback ID", {
          eventType: event.type,
          matchedPitchId: pitch.id,
          uploadId: identifiers.uploadId,
          assetId: identifiers.assetId,
        });
      }

      console.info("[Mux webhook] updated pitch", {
        eventType: event.type,
        matchedPitchId: pitch.id,
        updateResult: updatedPitch,
      });

      await writeWebhookLog(
        supabaseAdmin,
        buildWebhookLog({
          status: playbackId || updatedPitch.mux_playback_id ? "updated" : "ready_missing_playback",
          message:
            playbackId || updatedPitch.mux_playback_id
              ? "Stored ready asset and playback ID."
              : readyWithoutPlaybackMessage,
          event,
          identifiers: {
            ...identifiers,
            playbackId: playbackId || updatedPitch.mux_playback_id,
          },
          pitch: updatedPitch,
          matchedBy,
        })
      );
    } else if (
      event.type === "video.asset.errored" ||
      event.type === "video.upload.errored"
    ) {
      if (pitch.mux_playback_id) {
        await writeWebhookLog(
          supabaseAdmin,
          buildWebhookLog({
            status: "skipped_errored",
            message: "Skipped errored update because the pitch already has a playback ID.",
            event,
            identifiers: {
              ...identifiers,
              playbackId: pitch.mux_playback_id,
            },
            pitch,
            matchedBy,
          })
        );

        console.warn("[Mux webhook] skipped errored update because playback is already available", {
          eventType: event.type,
          matchedPitchId: pitch.id,
          uploadId: identifiers.uploadId,
          assetId: identifiers.assetId,
          playbackId: pitch.mux_playback_id,
        });
        return NextResponse.json({ message: "ok" });
      }

      const updatedPitch = await updatePitch(supabaseAdmin, pitch.id, {
        mux_upload_id: identifiers.uploadId || pitch.mux_upload_id,
        mux_asset_id: identifiers.assetId || pitch.mux_asset_id,
        mux_status: "errored",
        mux_error: getMuxErrorMessage(event.data),
      });

      console.info("[Mux webhook] updated pitch", {
        eventType: event.type,
        matchedPitchId: pitch.id,
        updateResult: updatedPitch,
      });

      await writeWebhookLog(
        supabaseAdmin,
        buildWebhookLog({
          status: "updated",
          message: updatedPitch.mux_error || "Stored errored asset state.",
          event,
          identifiers,
          pitch: updatedPitch,
          matchedBy,
        })
      );
    } else {
      await writeWebhookLog(
        supabaseAdmin,
        buildWebhookLog({
          status: "ignored",
          message: "Received an unsupported Mux event type.",
          event,
          identifiers,
          pitch,
          matchedBy,
        })
      );

      console.info("[Mux webhook] ignored unsupported event", {
        eventType: event.type,
      });
    }

    return NextResponse.json({ message: "ok" });
  } catch (error) {
    const parsedIdentifiers = parsedPayload
      ? getEventIdentifiers(parsedPayload)
      : {
          uploadId: null,
          assetId: null,
          playbackId: null,
          passthrough: null,
        };

    await writeWebhookLog(
      supabaseAdmin,
      buildWebhookLog({
        status: "handler_error",
        message: error.message,
        identifiers: parsedIdentifiers,
        payload: parsedPayload,
      })
    );

    console.error("[Mux webhook] handler failed", {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
