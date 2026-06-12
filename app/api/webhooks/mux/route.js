import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

async function resolvePitchId(event, supabaseAdmin) {
  const passthroughPitchId = event.data?.passthrough;
  if (passthroughPitchId) return passthroughPitchId;

  // Upload events usually identify the upload by data.id.
  const uploadId =
    event.type.startsWith("video.upload.") ? event.data?.id : event.data?.upload_id;

  if (uploadId) {
    const { data: byUpload } = await supabaseAdmin
      .from("pitches")
      .select("id")
      .eq("mux_upload_id", uploadId)
      .limit(1)
      .maybeSingle();
    if (byUpload?.id) return byUpload.id;
  }

  // Asset events can be linked using asset id once stored.
  const assetId = event.data?.asset_id || event.data?.id;
  if (assetId) {
    const { data: byAsset } = await supabaseAdmin
      .from("pitches")
      .select("id")
      .eq("mux_asset_id", assetId)
      .limit(1)
      .maybeSingle();
    if (byAsset?.id) return byAsset.id;
  }

  return null;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers.entries());
    const mux = getMuxClient();

    let event;
    try {
      event = mux.webhooks.unwrap(rawBody, headers);
    } catch {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const pitchId = await resolvePitchId(event, supabaseAdmin);
    if (!pitchId) {
      return NextResponse.json({ message: "ok" });
    }

    if (event.type === "video.upload.asset_created") {
      await supabaseAdmin
        .from("pitches")
        .update({
          mux_asset_id: event.data.asset_id,
          mux_status: "processing",
        })
        .eq("id", pitchId);
    } else if (event.type === "video.asset.ready") {
      const playbackId = event.data.playback_ids?.[0]?.id || null;
      await supabaseAdmin
        .from("pitches")
        .update({
          mux_asset_id: event.data.id,
          mux_playback_id: playbackId,
          mux_status: "ready",
        })
        .eq("id", pitchId);
    } else if (
      event.type === "video.asset.errored" ||
      event.type === "video.upload.errored"
    ) {
      await supabaseAdmin
        .from("pitches")
        .update({ mux_status: "errored" })
        .eq("id", pitchId);
    }

    return NextResponse.json({ message: "ok" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
