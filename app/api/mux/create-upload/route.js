import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { getMuxClient } from "../../../../lib/mux";

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
        // transcript available when the asset is ready.
        generated_subtitles: [
          {
            language_code: "en",
            name: "English (auto)",
          },
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
      })
      .eq("id", pitchId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
