import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// Public gallery feed of all submissions.
export async function GET() {
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
        mux_status,
        mux_playback_id,
        created_at,
        pitch_tags (
          tags ( id, name )
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const submissions = (data || []).map((pitch) => ({
      ...pitch,
      tags: pitch.pitch_tags?.map((pt) => pt.tags).filter(Boolean) || [],
      pitch_tags: undefined,
    }));

    return NextResponse.json(submissions);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
