import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

// GET — fetch all pitches with their tags (admin only)
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("pitches")
      .select(`
        id,
        name,
        role,
        schools,
        title,
        description,
        file_name,
        file_type,
        file_path,
        text_content,
        thumbnail_path,
        mux_asset_id,
        mux_status,
        mux_error,
        mux_playback_id,
        created_at,
        moderation_status,
        moderation_reason,
        moderation_flags,
        moderation_transcript,
        moderation_reviewed_by,
        moderation_reviewed_at,
        moderation_priority,
        moderation_checked_at,
        pitch_tags (
          tags ( id, name )
        ),
        pitch_votes (
          user_id,
          voter_name,
          voter_email,
          created_at
        )
      `)
      // Order flagged pitches to the top, then pending, then everything else
      // (approved / rejected / errored). Within each bucket, newest first.
      .order("moderation_priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const STATUS_RANK = { flagged: 0, pending: 1, errored: 2, approved: 3, rejected: 4 };

    // Flatten the nested pitch_tags → tags structure and sort by moderation state
    const pitches = data
      .map((pitch) => ({
        ...pitch,
        tags: pitch.pitch_tags?.map((pt) => pt.tags).filter(Boolean) || [],
        votes: pitch.pitch_votes || [],
        vote_count: pitch.pitch_votes?.length || 0,
        pitch_tags: undefined,
        pitch_votes: undefined,
      }))
      .sort((a, b) => {
        const ra = STATUS_RANK[a.moderation_status] ?? 99;
        const rb = STATUS_RANK[b.moderation_status] ?? 99;
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    return NextResponse.json(pitches);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove a pitch and its associated data (admin only)
export async function DELETE(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const pitchId = searchParams.get("id");
    if (!pitchId) {
      return NextResponse.json({ error: "Missing pitch id" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch pitch to get file info before deleting
    const { data: pitch } = await supabaseAdmin
      .from("pitches")
      .select("id, file_path, thumbnail_path, mux_asset_id")
      .eq("id", pitchId)
      .single();

    if (!pitch) {
      return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
    }

    // Delete associated votes
    await supabaseAdmin.from("pitch_votes").delete().eq("pitch_id", pitchId);

    // Delete associated tags
    await supabaseAdmin.from("pitch_tags").delete().eq("pitch_id", pitchId);

    // Delete file from storage if exists
    if (pitch.file_path) {
      await supabaseAdmin.storage.from("pitch-files").remove([pitch.file_path]);
    }

    // Delete thumbnail from storage if exists
    if (pitch.thumbnail_path) {
      await supabaseAdmin.storage.from("thumbnails").remove([pitch.thumbnail_path]);
    }

    // Delete the pitch record
    const { error } = await supabaseAdmin.from("pitches").delete().eq("id", pitchId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Delete Mux asset if this was a video pitch
    if (pitch.mux_asset_id) {
      try {
        const mux = getMuxClient();
        await mux.video.assets.delete(pitch.mux_asset_id);
      } catch (muxErr) {
        // Log but don't fail the delete if Mux cleanup fails
        console.error("Mux asset deletion failed:", muxErr.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
