import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// GET — read the current competition date + description (any authenticated user)
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("competition_settings")
      .select(
        "competition_date, submission_deadline, competition_description, seeds_visible"
      )
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      competition_date: data?.competition_date || null,
      submission_deadline: data?.submission_deadline || null,
      competition_description: data?.competition_description || null,
      // Undefined column (pre-migration) or NULL both default to true so
      // seed pitches show in the gallery by default.
      seeds_visible: data?.seeds_visible !== false,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — set/update the competition date and/or description (admin only)
export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const updates = { updated_at: new Date().toISOString() };

    if (body.competition_date !== undefined) {
      updates.competition_date = body.competition_date;
    }
    if (body.submission_deadline !== undefined) {
      updates.submission_deadline = body.submission_deadline;
    }
    if (body.competition_description !== undefined) {
      updates.competition_description = body.competition_description;
    }
    if (body.seeds_visible !== undefined) {
      updates.seeds_visible = !!body.seeds_visible;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { error: "No fields to update" },
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
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabaseAdmin
        .from("competition_settings")
        .insert(updates)
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
