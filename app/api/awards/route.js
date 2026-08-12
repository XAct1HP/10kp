// Public GET /api/awards — used by the Rules page to render the awards
// section with their sponsor logos. No auth required.
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { decorateSponsor } from "../../../lib/sponsors";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("awards")
      .select(
        `id, name, description, prize, sort_order, is_active,
         award_sponsors ( sort_order,
           sponsor:sponsors ( id, name, website, logo_path )
         )`
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

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
      return { ...rest, sponsors };
    });

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
