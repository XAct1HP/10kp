import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";

// Signed storage URLs cannot be permanent, so the CSV export never carries one
// directly. It carries /admin/file/<id> instead, which asks this route for a
// freshly signed URL each time an admin opens it. Short expiry is fine because
// the link is minted at click time.
const SIGNED_URL_TTL_SECONDS = 300;

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Resolve a pitch to something an admin can actually open:
//   - a document/other upload  → short-lived signed URL into the private bucket
//   - a Mux video/audio pitch  → the gallery player, which holds the Mux player
//   - a text-only pitch        → no file; caller decides what to do
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing pitch id" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: pitch, error } = await supabaseAdmin
      .from("pitches")
      .select("id, file_path, file_name, file_type, mux_playback_id, text_content")
      .eq("id", id)
      .single();

    if (error || !pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    if (pitch.file_path) {
      const { data, error: signError } = await supabaseAdmin.storage
        .from("pitch-files")
        .createSignedUrl(pitch.file_path, SIGNED_URL_TTL_SECONDS, {
          download: pitch.file_name || true,
        });
      if (signError || !data?.signedUrl) {
        return NextResponse.json(
          { error: signError?.message || "Could not sign the file URL" },
          { status: 500 }
        );
      }
      return NextResponse.json({
        kind: "file",
        url: data.signedUrl,
        file_name: pitch.file_name || null,
      });
    }

    if (pitch.mux_playback_id) {
      // Mux assets here are created with video_quality "basic", which has no
      // downloadable MP4 rendition — the gallery player is the reliable way to
      // watch or listen to one.
      return NextResponse.json({
        kind: "media",
        url: `/gallery?pitch=${encodeURIComponent(pitch.id)}`,
        file_name: pitch.file_name || null,
      });
    }

    return NextResponse.json(
      { kind: "text", error: "This submission is text-only — it has no pitch file." },
      { status: 404 }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
