// Public GET /api/awards — used by the Rules page to render the awards
// section with their sponsor logos, and by the intake form to offer award
// tracks. No auth required.
//
// Note what is NOT here: an award's AI matching criteria. Those live in the
// admin-only award_criteria table and must never reach the browser — they are
// the rubric the relevance check scores against.
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { decorateSponsor } from "../../../lib/sponsors";

// Awards are edited live from the admin Settings panel, so this route must
// never be statically prerendered or cached — otherwise the Rules page keeps
// serving the build-time snapshot.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .* does not exist/i.test(error?.message || "")
  );
}

export async function GET() {
  try {
    let { data, error } = await supabase
      .from("awards")
      .select(
        `id, name, description, prize, sort_order, is_active, is_raffle,
         award_sponsors ( sort_order,
           sponsor:sponsors ( id, name, website, logo_path )
         )`
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    // is_raffle arrives with migrations/20260825_award_tracks.sql. If this
    // deploy is ahead of the database, serve the awards without it rather
    // than blanking the Rules page.
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await supabase
        .from("awards")
        .select(
          `id, name, description, prize, sort_order, is_active,
           award_sponsors ( sort_order,
             sponsor:sponsors ( id, name, website, logo_path )
           )`
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }));
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []).map((row) => {
      const sponsors = (row.award_sponsors || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((j) => (j.sponsor ? decorateSponsor(j.sponsor) : null))
        .filter(Boolean);
      const { award_sponsors, ...rest } = row;
      return { ...rest, is_raffle: Boolean(rest.is_raffle), sponsors };
    });

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
