import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// GET — read the current competition date (any authenticated user)
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("competition_settings")
      .select("competition_date")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows — that's fine, just means no date set yet
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      competition_date: data?.competition_date || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — set/update the competition date (admin only)
export async function PUT(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { competition_date } = await request.json();
    if (!competition_date) {
      return NextResponse.json(
        { error: "competition_date is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Check if a row exists
    const { data: existing } = await supabaseAdmin
      .from("competition_settings")
      .select("id")
      .limit(1)
      .single();

    let result;
    if (existing) {
      result = await supabaseAdmin
        .from("competition_settings")
        .update({ competition_date, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabaseAdmin
        .from("competition_settings")
        .insert({ competition_date, updated_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
