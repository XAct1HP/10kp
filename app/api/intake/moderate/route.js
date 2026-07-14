import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { moderatePitchAsync } from "../../../../lib/moderation/pipeline";

// Kick off moderation for a newly submitted pitch.
// The pitch row is already inserted by the client (with any file/text
// uploaded). This endpoint just triggers the pipeline in the background so the
// UI can return the user to a "your pitch is being processed" screen without
// waiting.
//
// For video pitches, this can be called immediately as well — video
// moderation itself waits for the Mux webhook (asset ready) before running.
// But we always want a pipeline attempt so text-only/audio/doc paths run.

export const runtime = "nodejs";

export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { pitchId } = await request.json();
    if (!pitchId) {
      return NextResponse.json(
        { error: "pitchId is required" },
        { status: 400 }
      );
    }

    // Verify the pitch belongs to this user.
    const { data: pitch, error: pitchErr } = await auth.supabase
      .from("pitches")
      .select("id, file_type, mux_asset_id")
      .eq("id", pitchId)
      .eq("user_id", auth.user.id)
      .single();
    if (pitchErr || !pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    // Video pitches are moderated later, once Mux fires video.asset.ready.
    // For everything else, run the pipeline in the background now.
    const isVideo = pitch.file_type === "video" || pitch.mux_asset_id;
    if (!isVideo) {
      moderatePitchAsync(pitchId);
    }

    return NextResponse.json({
      status: "queued",
      message:
        "Your pitch is being reviewed. It will appear in the gallery once approved.",
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
