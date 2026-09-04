import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";
import { runVoteSweep } from "../../../../../lib/voteSweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

//   GET  — when did the detector last actually run, and did it work?
//   POST — run it now.
//
// Both exist because of a single sentence in the incident that prompted
// them: "this was never flagged". The queue was empty, the tab said
// "Nothing flagged", and there was no way — none, anywhere in the product
// — to tell that apart from a detector that had never once executed.

// The cron is hourly. Past two missed runs something is wrong, and the
// most likely somethings are a Vercel plan that silently downgrades
// hourly crons to daily, or an unset CRON_SECRET turning every
// invocation into a 401.
const STALE_AFTER_MS = 2 * 3_600_000;

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("vote_sweeps")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const runs = data || [];
    const lastOk = runs.find((r) => r.ok) || null;
    const last = runs[0] || null;
    const ageMs = lastOk ? Date.now() - new Date(lastOk.ran_at).getTime() : null;

    return NextResponse.json({
      last,
      lastOk,
      recent: runs,
      ageMs,
      // `never` is the state that matters most: it means the sweep has
      // not completed a single time, which is the exact condition the
      // product used to render as "Nothing flagged".
      never: !lastOk,
      stale: !lastOk || ageMs > STALE_AFTER_MS,
      staleAfterMs: STALE_AFTER_MS,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await runVoteSweep(getSupabaseAdmin(), { source: "manual" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
