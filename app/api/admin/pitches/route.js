import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

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
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the nested pitch_tags → tags structure
    const pitches = data.map((pitch) => ({
      ...pitch,
      tags: pitch.pitch_tags?.map((pt) => pt.tags).filter(Boolean) || [],
      votes: pitch.pitch_votes || [],
      vote_count: pitch.pitch_votes?.length || 0,
      pitch_tags: undefined,
      pitch_votes: undefined,
    }));

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

    // Note: Mux asset cleanup could be done here via Mux API if desired
    // For now we just delete the database record

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
