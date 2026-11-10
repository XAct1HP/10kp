import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { loadHallOfFame } from "../../../../lib/hallOfFame";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Admin editor payload: current HoF composition + awards + award
// announcements so organizers can Record / Edit winners without leaving
// the Hall of Fame tab.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const [hof, awardsRes] = await Promise.all([
      loadHallOfFame(supabaseAdmin),
      supabaseAdmin
        .from("awards")
        .select(
          "id, name, description, prize, sort_order, is_active, award_sponsors ( sort_order, sponsor:sponsors ( id, name, website, logo_path ) )"
        )
        .order("sort_order", { ascending: true }),
    ]);

    if (awardsRes.error) {
      return NextResponse.json({ error: awardsRes.error.message }, { status: 500 });
    }

    const awards = (awardsRes.data || [])
      .filter((a) => a.is_active !== false)
      .map((a) => {
        const sponsors = (a.award_sponsors || [])
          .slice()
          .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
          .map((j) => j.sponsor)
          .filter(Boolean);
        const { award_sponsors, ...rest } = a;
        return { ...rest, sponsors };
      });

    // Latest published announcement per award (for Edit), plus all award
    // announcements for the list.
    const latestByAward = {};
    for (const ann of hof.awardAnnouncements) {
      if (!ann.award_id) continue;
      if (!latestByAward[ann.award_id]) latestByAward[ann.award_id] = ann;
    }

    return NextResponse.json({
      year: hof.year,
      isPublic: hof.isPublic,
      winners: hof.winners,
      count: hof.count,
      defaults: hof.defaults,
      awards,
      awardAnnouncements: hof.awardAnnouncements,
      latestByAward,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
