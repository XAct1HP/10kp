import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

// Stream an audio file from Supabase private storage
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Only allow streaming the audio file if it belongs to an approved pitch.
    // This is a public gallery endpoint — un-moderated content must not be
    // reachable even by direct file_path guess.
    const { data: owningPitch } = await supabaseAdmin
      .from("pitches")
      .select("id, moderation_status")
      .eq("file_path", filePath)
      .limit(1)
      .maybeSingle();
    if (!owningPitch || owningPitch.moderation_status !== "approved") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("pitch-files")
      .download(filePath);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    // Determine content type from file extension
    const ext = (filePath.split(".").pop() || "").toLowerCase();
    const contentTypes = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      aac: "audio/aac",
      m4a: "audio/mp4",
      webm: "audio/webm",
    };

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypes[ext] || "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
