import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

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

    const pitchId = event.data?.passthrough;
    if (!pitchId) {
      return NextResponse.json({ message: "ok" });
    }

    const supabaseAdmin = getSupabaseAdmin();

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
