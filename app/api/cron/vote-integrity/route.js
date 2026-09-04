import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getModerationConfig } from "../../../../lib/env";
import { runVoteSweep } from "../../../../lib/voteSweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled vote-integrity sweep. Runs hourly (Vercel Cron — see
// vercel.json).
//
// The gallery ballot is open by design: no login, no verified email. That
// makes a second identity cheap, so instead of blocking it we look for its
// fingerprints and put clusters in front of a human in the admin Votes tab.
//
// This is no longer the ONLY thing that looks. Since 2026-09-04 the vote
// route runs the same engine over a narrow slice on the way in
// (lib/voteRealtime.js), because an hourly cron leaves an hour-long
// window in which a ballot can be stuffed and the queue looks clean. This
// sweep is the wide, unhurried backstop: it sees the whole 45-day window,
// catches slow drips that no single vote makes obvious, and resolves
// flags that no longer hold.
//
// It NEVER deletes a vote or changes a tally. Voiding is a deliberate,
// human, audited action.
//
// Auth: same shared secret as the moderation cron. Vercel Cron injects
// `Authorization: Bearer <CRON_SECRET>` automatically. If that variable
// is unset every run 401s — which used to be invisible, and is now
// visible as a growing gap in vote_sweeps and a warning in the admin UI.

function isAuthorized(request) {
  const cfg = getModerationConfig();
  if (!cfg.cronSecret) return { ok: false, error: "CRON_SECRET not configured" };
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (provided && provided === cfg.cronSecret) return { ok: true };
  return { ok: false, error: "Unauthorized" };
}

export async function POST(request) { return handle(request); }
export async function GET(request) { return handle(request); }

async function handle(request) {
  const authz = isAuthorized(request);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: 401 });
  }

  const result = await runVoteSweep(getSupabaseAdmin(), { source: "cron" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
