// Lightweight pitch search endpoint used by the "Record Winners" picker.
// Returns just the fields needed to render a compact search-result list.
import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";

const SELECT = `id, name, role, schools, title, description,
                file_type, file_name, mux_playback_id, thumbnail_path,
                moderation_status, created_at`;

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 25, 100);

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("pitches")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      // Case-insensitive match against pitch title, pitcher name, or description.
      const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      query = query.or(`title.ilike.${like},name.ilike.${like},description.ilike.${like}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
