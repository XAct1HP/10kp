import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public gallery feed of all submissions.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") || "8", 10), 1),
      24
    );
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error, count } = await supabaseAdmin
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
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const submissions = (data || []).map((pitch) => ({
      ...pitch,
      tags: pitch.pitch_tags?.map((pt) => pt.tags).filter(Boolean) || [],
      pitch_tags: undefined,
    }));

    return NextResponse.json(
      {
        submissions,
        pagination: {
          page,
          pageSize,
          total: count || 0,
          hasMore: from + (data?.length || 0) < (count || 0),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
