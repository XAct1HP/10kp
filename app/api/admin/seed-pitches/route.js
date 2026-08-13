import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

export const runtime = "nodejs";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000")
  );
}

// GET — list existing seed pitches (past-winner videos) for the admin
// panel. Kept separate from /api/admin/pitches so the admin UI doesn't
// have to filter a mixed list.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select(
      "id, name, title, description, mux_status, mux_playback_id, mux_asset_id, mux_error, created_at, is_seed"
    )
    .eq("is_seed", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pitches: data || [] });
}

// POST — create a seed pitch row and mint a Mux direct-upload URL.
// The row is marked approved on both moderation columns so the pipeline
// leaves it alone and it appears in the gallery as soon as Mux finishes
// processing.
export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body?.title || "").trim();
  const name = (body?.name || "").trim();
  const description = (body?.description || "").trim();

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Submitter name is required." }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();

  // Insert the pitch row first so we can pass its UUID to Mux as
  // passthrough — matching the pattern used for regular pitches.
  const { data: pitch, error: insertError } = await supabaseAdmin
    .from("pitches")
    .insert({
      user_id: auth.user.id,
      name,
      title,
      description: description || "Past winner from a previous 10K Pitches competition.",
      file_type: "video",
      file_name: `${title} (past winner)`,
      is_seed: true,
      // Skip the moderation pipeline entirely — service role bypasses the
      // pitches_protect_moderation trigger so these writes stick.
      moderation_status: "approved",
      moderation_state: "approved",
      moderation_source: "seed",
      moderation_summary: "Seed pitch — past-year winner uploaded by admin.",
      visual_moderation_status: "not_applicable",
      transcript_moderation_status: "not_applicable",
      transcript_status: "not_applicable",
      media_status: "uploading",
      mux_status: "uploading",
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const mux = getMuxClient();
    const upload = await mux.video.uploads.create({
      cors_origin: siteUrl(),
      new_asset_settings: {
        passthrough: pitch.id,
        playback_policies: ["public"],
        video_quality: "basic",
        // Seed pitches don't need captions for moderation (they skip the
        // pipeline entirely) but auto-subs are still nice for the gallery
        // player, so we generate them.
        inputs: [
          {
            generated_subtitles: [
              { language_code: "en", name: "English (auto)" },
            ],
          },
        ],
      },
    });

    const { error: updateError } = await supabaseAdmin
      .from("pitches")
      .update({ mux_upload_id: upload.id })
      .eq("id", pitch.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      pitchId: pitch.id,
      uploadUrl: upload.url,
      uploadId: upload.id,
    });
  } catch (err) {
    // Roll back the pitch row so a Mux failure doesn't leave a stranded
    // "uploading" seed pitch cluttering the list.
    await supabaseAdmin.from("pitches").delete().eq("id", pitch.id);
    return NextResponse.json(
      { error: err.message || "Failed to create Mux upload." },
      { status: 500 }
    );
  }
}

// DELETE — remove a seed pitch (and its Mux asset). Refuses to delete
// non-seed rows so this endpoint can never touch real submissions.
export async function DELETE(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const pitchId = searchParams.get("id");
  if (!pitchId) {
    return NextResponse.json({ error: "Missing pitch id" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: pitch, error: fetchError } = await supabaseAdmin
    .from("pitches")
    .select("id, is_seed, mux_asset_id")
    .eq("id", pitchId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!pitch) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }
  if (!pitch.is_seed) {
    return NextResponse.json(
      { error: "Refusing to delete a non-seed pitch through this endpoint." },
      { status: 400 }
    );
  }

  await supabaseAdmin.from("pitch_votes").delete().eq("pitch_id", pitchId);
  await supabaseAdmin.from("pitch_tags").delete().eq("pitch_id", pitchId);

  const { error: deleteError } = await supabaseAdmin
    .from("pitches")
    .delete()
    .eq("id", pitchId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (pitch.mux_asset_id) {
    try {
      const mux = getMuxClient();
      await mux.video.assets.delete(pitch.mux_asset_id);
    } catch (muxErr) {
      // Non-fatal — the DB row is gone; Mux storage will linger until
      // manually purged. Log so ops notices.
      console.error("[seed-pitches.delete] Mux asset cleanup failed", {
        pitchId,
        assetId: pitch.mux_asset_id,
        error: muxErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
