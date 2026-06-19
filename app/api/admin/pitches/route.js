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
        title,
        description,
        file_name,
        file_type,
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
