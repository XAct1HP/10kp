import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase";
import { decorateSponsor } from "../../../lib/sponsors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public GET — returns sponsors ordered by sort_order for the homepage carousel.
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .select("id, name, website, logo_path, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(decorateSponsor), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
