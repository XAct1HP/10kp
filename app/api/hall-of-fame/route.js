import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase";
import { verifyAdmin } from "../../../lib/adminAuth";
import { loadHallOfFame } from "../../../lib/hallOfFame";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Hall of Fame = winners from published award announcements (Record Winners),
// with seed / archive winner_year as fallback. Public when
// competition_settings.hall_of_fame_public is true; otherwise admin-only.
export async function GET(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const payload = await loadHallOfFame(supabaseAdmin);

    if (!payload.isPublic) {
      const auth = await verifyAdmin(request);
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
    }

    return NextResponse.json(
      {
        year: payload.year,
        winners: payload.winners,
        defaults: payload.defaults,
        count: payload.count,
        isPublic: payload.isPublic,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
