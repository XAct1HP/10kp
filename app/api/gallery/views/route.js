import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { verifyUser } from "../../../../lib/userAuth";

export const dynamic = "force-dynamic";

function isMissingTable(error) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist/i.test(error.message || "") ||
    /Could not find the table/i.test(error.message || "")
  );
}

// POST — record a gallery detail open as one view (deduped per viewer_key).
// Body: { pitchId, viewerKey? }
export async function POST(request) {
  try {
    const body = await request.json();
    const pitchId = body?.pitchId;
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }

    let userId = null;
    let viewerKey = typeof body?.viewerKey === "string" ? body.viewerKey.trim() : "";

    const auth = await verifyUser(request);
    if (!auth.error && auth.user) {
      userId = auth.user.id;
      viewerKey = `user:${auth.user.id}`;
    }

    if (!viewerKey || viewerKey.length < 8 || viewerKey.length > 120) {
      return NextResponse.json(
        { error: "viewerKey is required for anonymous views." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: pitch } = await supabase
      .from("pitches")
      .select("id, moderation_status, is_seed, view_count")
      .eq("id", pitchId)
      .maybeSingle();

    if (!pitch || (pitch.moderation_status !== "approved" && !pitch.is_seed)) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    const { error: insertError } = await supabase.from("pitch_views").insert({
      pitch_id: pitchId,
      viewer_key: viewerKey,
      user_id: userId,
    });

    if (insertError) {
      if (isMissingTable(insertError) || insertError.code === "42703") {
        return NextResponse.json({
          counted: false,
          viewCount: pitch.view_count ?? 0,
          skipped: true,
        });
      }
      // Unique violation = already counted this viewer
      if (insertError.code === "23505") {
        return NextResponse.json({
          counted: false,
          viewCount: pitch.view_count ?? 0,
        });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const nextCount = (pitch.view_count || 0) + 1;
    const { error: updateError } = await supabase
      .from("pitches")
      .update({ view_count: nextCount })
      .eq("id", pitchId);

    if (updateError && updateError.code !== "42703" && updateError.code !== "PGRST204") {
      console.error("[gallery/views] increment failed", updateError.message);
    }

    return NextResponse.json({ counted: true, viewCount: nextCount });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
