import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";

// GET /api/admin/moderation/queue
//
// Query params (all optional, comma-separated where relevant):
//   ?state=needs_review,processing,failed
//   ?category=sexual_content,hate
//   ?type=video,audio,text
//   ?since=2026-07-01
//
// Returns admin-view pitches filtered by moderation criteria. Uses the
// service-role Supabase client — students never hit this endpoint.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const states = parseList(searchParams.get("state"));
  const types = parseList(searchParams.get("type"));
  const since = searchParams.get("since");
  const category = parseList(searchParams.get("category"));

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("pitches")
    .select(`
      id, name, title, description, file_name, file_type,
      thumbnail_path, mux_asset_id, mux_playback_id, mux_status,
      created_at,
      media_status,
      moderation_state, moderation_status, moderation_summary,
      moderation_categories, moderation_reasons, moderation_scores,
      moderation_priority, moderation_reviewed_by, moderation_reviewed_at,
      moderation_attempt_count, moderation_next_attempt_at, moderation_last_error,
      moderation_admin_notes,
      transcript, transcript_status, transcript_language,
      visual_moderation_status, transcript_moderation_status,
      mux_moderation_job_id, mux_moderation_result
    `)
    .order("moderation_priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (states && states.length) query = query.in("moderation_state", states);
  if (types && types.length) query = query.in("file_type", types);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let filtered = data || [];
  if (category && category.length) {
    filtered = filtered.filter((p) => {
      const cats = Array.isArray(p.moderation_categories) ? p.moderation_categories : [];
      return cats.some((c) => category.includes(c?.category));
    });
  }

  return NextResponse.json({ pitches: filtered, count: filtered.length });
}

function parseList(v) {
  if (!v) return null;
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}
