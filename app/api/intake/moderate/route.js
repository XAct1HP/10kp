import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import {
  enqueueForModeration,
  runModerationInBackground,
} from "../../../../lib/moderation/pipeline";

export const runtime = "nodejs";

// POST /api/intake/moderate
// Body: { pitchId }
//
// Called by the intake form once a pitch row exists (and any Supabase-hosted
// file has finished uploading). For video/audio (Mux) pitches, the actual
// pipeline runs when the Mux webhook fires video.asset.ready — we just
// mark the row as queued here so the reconciler picks it up if the webhook
// is late or missed. For text / text-doc pitches we optimistically kick the
// pipeline off in the background right away.
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { pitchId } = await request.json();
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }

    const { data: pitch, error: pitchErr } = await auth.supabase
      .from("pitches")
      .select("id, file_type, mux_asset_id, mux_upload_id")
      .eq("id", pitchId)
      .eq("user_id", auth.user.id)
      .single();
    if (pitchErr || !pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    // Always mark queued — this is the durable signal for the reconciler.
    await enqueueForModeration(pitchId, { source: "intake" });

    // Optimistically run the pipeline in the background for pitches that
    // don't rely on the Mux webhook. Video/audio pipelines require the
    // asset to reach `ready` before the transcript and Robots job make
    // sense, so we skip the background run for them and let the webhook
    // trigger runModerationInBackground.
    const isMux = pitch.file_type === "video" ||
                  pitch.file_type === "audio" ||
                  Boolean(pitch.mux_upload_id) ||
                  Boolean(pitch.mux_asset_id);
    if (!isMux) {
      runModerationInBackground(pitchId);
    }

    return NextResponse.json({
      status: "queued",
      message:
        "Your pitch was submitted and is being reviewed. It will appear in the gallery once approved.",
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
