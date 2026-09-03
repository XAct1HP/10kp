import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getModerationConfig } from "../../../../lib/env";
import { rescoreRecentVotes } from "../../../../lib/votes/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nightly / periodic rescore of pitch_votes risk fields.
// Auth: Authorization: Bearer $CRON_SECRET (same as moderation reconciler).

function isAuthorized(request) {
  const cfg = getModerationConfig();
  if (!cfg.cronSecret) {
    return { ok: false, error: "CRON_SECRET not configured" };
  }
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (provided && provided === cfg.cronSecret) return { ok: true };
  return { ok: false, error: "Unauthorized" };
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  return handle(request);
}

async function handle(request) {
  const authz = isAuthorized(request);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  try {
    const result = await rescoreRecentVotes(supabase, { limit: 200 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Vote risk rescore failed" },
      { status: 500 }
    );
  }
}
