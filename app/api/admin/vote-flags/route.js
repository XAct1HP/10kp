import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Admin triage surface for the vote-integrity detector.
//
//   GET    — list flagged clusters (newest sweep first)
//   PATCH  — record a human decision on a cluster
//   POST   — void the votes behind a cluster (the only destructive action,
//            and it is never taken automatically)
//
// The detector itself lives in lib/voteIntegrity.js and runs hourly from
// /api/cron/vote-integrity. Nothing there touches a tally — a vote only
// disappears when an admin presses the button that calls POST below.

const VALID_STATUSES = new Set(["open", "dismissed", "confirmed", "actioned", "resolved"]);

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("vote_flags")
      .select("*, pitches ( id, title, name )")
      .order("score", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(300);

    // Default view is the triage queue; "all" opens the full history.
    if (status && status !== "all") {
      query = query.eq("status", status);
    } else if (!status) {
      query = query.eq("status", "open");
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const flags = (data || []).map((flag) => ({
      ...flag,
      pitch_title: flag.pitches?.title || null,
      pitch_submitter: flag.pitches?.name || null,
      pitches: undefined,
    }));

    return NextResponse.json(flags);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { id, status, reviewNote } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("vote_flags")
      .update({
        status,
        review_note: reviewNote ?? null,
        reviewed_by: auth.user?.email || "admin",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Void the votes behind a cluster. Destructive and deliberate: the caller
// passes the flag id, optionally narrowing to a subset of vote ids so an
// admin can keep the votes they believe are genuine. The flag is then
// marked `actioned` with a note recording exactly how many votes went.
export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { id, voteIds, reviewNote } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: flag, error: flagError } = await supabaseAdmin
      .from("vote_flags")
      .select("id, vote_ids")
      .eq("id", id)
      .maybeSingle();

    if (flagError) {
      return NextResponse.json({ error: flagError.message }, { status: 500 });
    }
    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Only ever delete ids that belong to this flag — a caller cannot use
    // this endpoint to reach arbitrary votes.
    const owned = new Set(flag.vote_ids || []);
    const targets = Array.isArray(voteIds) && voteIds.length > 0
      ? voteIds.filter((v) => owned.has(v))
      : [...owned];

    if (targets.length === 0) {
      return NextResponse.json({ error: "No votes to void" }, { status: 400 });
    }

    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("pitch_votes")
      .delete()
      .in("id", targets)
      .select("id");

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const voidedCount = deleted?.length || 0;
    const stamp = new Date().toISOString();
    const actor = auth.user?.email || "admin";

    await supabaseAdmin
      .from("vote_flags")
      .update({
        status: "actioned",
        review_note:
          reviewNote ||
          `Voided ${voidedCount} vote(s) on ${stamp.slice(0, 10)}.`,
        reviewed_by: actor,
        reviewed_at: stamp,
      })
      .eq("id", id);

    return NextResponse.json({ success: true, voided: voidedCount });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
