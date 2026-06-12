import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient, getMuxWebhookSecret } from "../../../../lib/mux";

function getEventIdentifiers(event) {
  const data = event.data || {};
  const isUploadEvent = event.type.startsWith("video.upload.");

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

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const mux = getMuxClient();
    const webhookSecret = getMuxWebhookSecret();

    let event;
    try {
      event = mux.webhooks.unwrap(rawBody, request.headers, webhookSecret);
    } catch (error) {
      console.warn("[Mux webhook] invalid signature", {
        error: error.message,
      });
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
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
    } else if (
      event.type === "video.asset.errored" ||
      event.type === "video.upload.errored"
    ) {
      if (pitch.mux_playback_id) {
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
    } else {
      console.info("[Mux webhook] ignored unsupported event", {
        eventType: event.type,
      });
    }

    return NextResponse.json({ message: "ok" });
  } catch (error) {
    console.error("[Mux webhook] handler failed", {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
