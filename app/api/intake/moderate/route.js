import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import {
  runModeration,
  enqueueForModeration,
} from "../../../../lib/moderation/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/intake/moderate — body: { pitchId }
// Text / text-doc pitches run the pipeline synchronously so the terminal
// state is set before we respond. Mux pitches only enqueue — the webhook
// re-triggers runModeration once the asset is ready.
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

    const isMux = pitch.file_type === "video" ||
                  pitch.file_type === "audio" ||
                  Boolean(pitch.mux_upload_id) ||
                  Boolean(pitch.mux_asset_id);

    if (isMux) {
      await enqueueForModeration(pitchId, { source: "intake" });
      return NextResponse.json({
        status: "queued",
        message: "Your pitch was uploaded and is being processed. It will appear in the gallery once approved.",
      });
    }

    try {
      const outcome = await runModeration(pitchId);
      return NextResponse.json({
        status: outcome?.finalState || "processing",
        message: "Your pitch was submitted and reviewed. It will appear in the gallery once approved.",
      });
    } catch (err) {
      // Pipeline already persisted failure/retry state internally.
      return NextResponse.json({
        status: "queued",
        message: "Your pitch was submitted and is awaiting administrative review.",
        error: err.message,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
