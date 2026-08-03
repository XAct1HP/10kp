import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { runModeration } from "../../../../lib/moderation/pipeline";
import { getModerationConfig } from "../../../../lib/env";
import { MODERATION_STATE } from "../../../../lib/moderation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled reconciler for moderation. Runs periodically (Vercel Cron,
// external scheduler, etc.). Picks up:
//   1. Rows in `queued` whose next-attempt time has arrived.
//   2. Rows that got stuck in `processing` past a stale threshold
//      (typically because a serverless function was killed mid-run).
//   3. Rows in `failed` whose retry window has arrived.
//   4. Rows stranded in `not_started` because the submit-time handoff
//      never completed.
//
// Auth: caller must supply the shared secret configured in
// MODERATION_CRON_SECRET (via `Authorization: Bearer <secret>` OR the
// standard Vercel cron header). If no secret is configured, the endpoint
// refuses to run — this keeps unmoderated content from being retried by
// unauthenticated pings.

const STALE_PROCESSING_MS = 15 * 60_000; // 15 minutes
const STRANDED_NOT_STARTED_MS = 30_000; // grace period after insert
const BATCH_SIZE = 25;

function isAuthorized(request) {
  const cfg = getModerationConfig();
  if (!cfg.cronSecret) return { ok: false, error: "MODERATION_CRON_SECRET not configured" };
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  // Vercel Cron sets `x-vercel-cron: 1` on scheduled invocations. Even so,
  // we still require the shared secret to prevent unauthenticated pings
  // from arbitrary callers.
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

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const strandedThreshold = new Date(Date.now() - STRANDED_NOT_STARTED_MS).toISOString();

  // Query: eligible pitches.
  // Two SELECTs then union in JS — Supabase doesn't do OR + range trivially.
  const { data: queued } = await supabase
    .from("pitches")
    .select("id, moderation_state, moderation_started_at, moderation_next_attempt_at, moderation_attempt_count")
    .eq("moderation_state", MODERATION_STATE.QUEUED)
    .lte("moderation_next_attempt_at", now)
    .order("moderation_next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  const { data: stale } = await supabase
    .from("pitches")
    .select("id, moderation_state, moderation_started_at, moderation_attempt_count")
    .eq("moderation_state", MODERATION_STATE.PROCESSING)
    .lt("moderation_started_at", staleThreshold)
    .order("moderation_started_at", { ascending: true })
    .limit(BATCH_SIZE);

  const { data: failed } = await supabase
    .from("pitches")
    .select("id, moderation_state, moderation_next_attempt_at, moderation_attempt_count")
    .eq("moderation_state", MODERATION_STATE.FAILED)
    .order("moderation_next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  const { data: notStarted } = await supabase
    .from("pitches")
    .select("id, moderation_state, created_at, file_type, media_status, mux_asset_id")
    .eq("moderation_state", MODERATION_STATE.NOT_STARTED)
    .lt("created_at", strandedThreshold)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  const eligibleFailed = (failed || []).filter((pitch) => (
    !pitch.moderation_next_attempt_at ||
    new Date(pitch.moderation_next_attempt_at).getTime() <= Date.now()
  ));

  const eligibleNotStarted = (notStarted || []).filter((pitch) => {
    const isMux = pitch.file_type === "video" || pitch.file_type === "audio";
    if (!isMux) return true;
    return pitch.media_status === "ready" || Boolean(pitch.mux_asset_id);
  });

  const pitchIds = Array.from(new Set([
    ...(queued || []).map((p) => p.id),
    ...(stale || []).map((p) => p.id),
    ...eligibleFailed.map((p) => p.id),
    ...eligibleNotStarted.map((p) => p.id),
  ]));

  const results = [];
  for (const pitchId of pitchIds) {
    // If the row is stuck in `processing`, first reset it to `queued` so
    // runModeration's atomic reservation can take ownership.
    await supabase
      .from("pitches")
      .update({
        moderation_state: MODERATION_STATE.QUEUED,
        moderation_next_attempt_at: now,
        moderation_last_error: "Recovered from stale processing state.",
      })
      .eq("id", pitchId)
      .eq("moderation_state", MODERATION_STATE.PROCESSING);

    try {
      const outcome = await runModeration(pitchId);
      results.push({ pitchId, outcome: outcome?.finalState || outcome?.skipped });
    } catch (err) {
      results.push({ pitchId, error: err.message });
    }
  }

  return NextResponse.json({
    processed: results.length,
    picked_up: pitchIds.length,
    results,
  });
}
