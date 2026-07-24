import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { getMuxClient } from "../../../../lib/mux";
import { MEDIA_STATUS } from "../../../../lib/moderation/types";

export const runtime = "nodejs";

// POST /api/mux/create-upload
// Body: { pitchId: string, kind?: "video" | "audio" }
//
// Creates a Mux Direct Upload URL and marks the pitch as `uploading`.
// Audio files are Mux-backed as well so the moderation pipeline can rely
// on Mux-generated captions instead of a local Whisper install.
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { pitchId, kind } = await request.json();
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }
    if (kind && !["video", "audio"].includes(kind)) {
      return NextResponse.json(
        { error: "kind must be 'video' or 'audio'" }, { status: 400 }
      );
    }
    const mediaKind = kind || "video";

    // Verify the pitch belongs to the caller before minting a Mux upload URL.
    const { data: pitch, error: pitchError } = await auth.supabase
      .from("pitches")
      .select("id")
      .eq("id", pitchId)
      .eq("user_id", auth.user.id)
      .single();

    if (pitchError || !pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    const mux = getMuxClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000");

    const upload = await mux.video.uploads.create({
      cors_origin: siteUrl,
      new_asset_settings: {
        passthrough: pitchId,
        playback_policies: ["public"],
        video_quality: "basic",
        // Auto-generate English subtitles so the moderation pipeline has a
        // transcript for both video AND audio pitches. Mux runs the same
        // caption generator on audio-only assets.
        generated_subtitles: [
          { language_code: "en", name: "English (auto)" },
        ],
      },
    });

    const { error: updateError } = await auth.supabase
      .from("pitches")
      .update({
        mux_upload_id: upload.id,
        mux_asset_id: null,
        mux_playback_id: null,
        mux_status: "uploading",
        mux_error: null,
        // v2 state — server-owned via RLS trigger; the anon-key client can't
        // update this. We rely on the /api/intake/moderate route (which uses
        // the service-role admin client) to move the pitch through moderation
        // states. Setting file_type here so the pipeline can classify it.
        file_type: mediaKind,
      })
      .eq("id", pitchId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      uploadUrl: upload.url,
      uploadId: upload.id,
      mediaStatus: MEDIA_STATUS.UPLOADING,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
