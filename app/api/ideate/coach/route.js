import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { DAILY_COACH_LIMIT, sanitizeIdeateData } from "../../../../lib/ideate/curriculum";
import { COACH_MODES, runCoach } from "../../../../lib/ideate/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 200_000;

// POST /api/ideate/coach — body: { mode, data }
// The page sends its current workspace so the coach sees unsaved edits; it is
// sanitised exactly like a save, and each mode refuses to run until the
// student has written the part it reacts to.
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That's more than the coach can read at once." }, { status: 413 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = typeof body?.mode === "string" ? body.mode : "";
  const spec = COACH_MODES[mode];
  if (!spec) return NextResponse.json({ error: "Unknown coach request." }, { status: 400 });

  const data = sanitizeIdeateData(body?.data);
  const notReady = spec.ready(data);
  if (notReady) return NextResponse.json({ error: notReady }, { status: 422 });

  const admin = getSupabaseAdmin();
  const userId = auth.user.id;

  const { data: claimed, error: claimError } = await admin.rpc("ideate_claim_ai_call", {
    p_user_id: userId,
    p_limit: DAILY_COACH_LIMIT,
  });
  if (claimError) {
    console.error("[ideate] usage claim failed:", claimError.message);
    return NextResponse.json({ error: "The coach isn't available right now." }, { status: 503 });
  }
  if (claimed === null || claimed === undefined) {
    return NextResponse.json(
      {
        error: "You've used all of today's coach help. Keep going on your own; it resets at midnight.",
        usage: { used: DAILY_COACH_LIMIT, limit: DAILY_COACH_LIMIT },
      },
      { status: 429 }
    );
  }

  try {
    const reply = await runCoach(mode, data);
    return NextResponse.json({ reply, usage: { used: claimed, limit: DAILY_COACH_LIMIT } });
  } catch (err) {
    console.error(`[ideate] coach ${mode} failed:`, err?.message || err);
    // An outage shouldn't eat the student's allowance.
    const { error: refundError } = await admin.rpc("ideate_refund_ai_call", { p_user_id: userId });
    if (refundError) console.error("[ideate] refund failed:", refundError.message);
    return NextResponse.json(
      {
        error: "The coach couldn't answer just now. Try again in a moment.",
        usage: { used: Math.max(0, claimed - (refundError ? 0 : 1)), limit: DAILY_COACH_LIMIT },
      },
      { status: 502 }
    );
  }
}
