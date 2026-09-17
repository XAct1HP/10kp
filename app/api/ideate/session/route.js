import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { STEPS, DAILY_COACH_LIMIT, sanitizeIdeateData } from "../../../../lib/ideate/curriculum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BODY_BYTES = 200_000;

function todayInAnnArbor() {
  // en-CA formats as YYYY-MM-DD, matching the SQL (now() at time zone 'America/New_York')::date.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

async function usageFor(admin, userId) {
  const { data } = await admin
    .from("ideate_ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("day", todayInAnnArbor())
    .maybeSingle();
  return { used: data?.calls || 0, limit: DAILY_COACH_LIMIT };
}

// GET /api/ideate/session — the caller's saved workspace (or null) + today's coach usage.
export async function GET(request) {
  const auth = await verifyUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("ideate_sessions")
      .select("data, current_step, completed_at, updated_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json(
      {
        session: data
          ? {
              data: sanitizeIdeateData(data.data),
              currentStep: Math.min(STEPS.length - 1, Math.max(0, data.current_step || 0)),
              completedAt: data.completed_at,
              updatedAt: data.updated_at,
            }
          : null,
        usage: await usageFor(admin, auth.user.id),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[ideate] load failed:", err?.message || err);
    return NextResponse.json({ error: "Could not load your saved work." }, { status: 500 });
  }
}

// PUT /api/ideate/session — body: { data, currentStep, completed }
export async function PUT(request) {
  const auth = await verifyUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "That's more than we can save at once." }, { status: 413 });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const step = Math.min(STEPS.length - 1, Math.max(0, Math.round(Number(body?.currentStep) || 0)));
    const row = {
      user_id: auth.user.id,
      data: sanitizeIdeateData(body?.data),
      current_step: step,
      completed_at: body?.completed ? new Date().toISOString() : null,
    };

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("ideate_sessions")
      .upsert(row, { onConflict: "user_id" })
      .select("updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, updatedAt: data.updated_at });
  } catch (err) {
    console.error("[ideate] save failed:", err?.message || err);
    return NextResponse.json({ error: "Could not save your work." }, { status: 500 });
  }
}

// DELETE /api/ideate/session — start over. The coach usage counter is untouched.
export async function DELETE(request) {
  const auth = await verifyUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("ideate_sessions").delete().eq("user_id", auth.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ideate] reset failed:", err?.message || err);
    return NextResponse.json({ error: "Could not reset your work." }, { status: 500 });
  }
}
