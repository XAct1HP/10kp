import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { canonicalInbox } from "../../../../lib/voteIntegrity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The Votes → Audit Trail surface.
//
//   GET   — the most recent votes, with the raw fingerprint an admin
//           needs during an incident and enough context to spot a ring
//           by eye without waiting for the detector.
//   PATCH — void or restore votes.
//
// Voiding is SOFT. The row stays in the trail, struck through, carrying
// who voided it and why; it simply stops counting anywhere a tally is
// computed. The old behaviour deleted the row outright, which destroyed
// the evidence at the exact moment someone had decided the evidence
// mattered — and made a mistaken void unrecoverable.

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2_000;

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "all"; // all | live | voided
    const limit = Math.min(
      Number(searchParams.get("limit")) || DEFAULT_LIMIT,
      MAX_LIMIT
    );

    let query = supabaseAdmin
      .from("pitch_votes")
      .select(`
        id,
        pitch_id,
        user_id,
        voter_name,
        voter_email,
        voter_inbox,
        created_at,
        ip_address,
        user_agent,
        geo_country,
        geo_region,
        geo_city,
        voided_at,
        voided_by,
        void_reason,
        pitches (
          title,
          name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope === "live") query = query.is("voided_at", null);
    if (scope === "voided") query = query.not("voided_at", "is", null);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];

    // How many other votes in this window came from the same mailbox.
    // Twelve rows reading "12" next to twelve different-looking addresses
    // is the thing that should have been obvious on screen the first
    // time, with or without a detector.
    const inboxCounts = new Map();
    for (const vote of rows) {
      const inbox =
        vote.voter_inbox || canonicalInbox(vote.voter_email) || vote.voter_email;
      if (!inbox) continue;
      inboxCounts.set(inbox, (inboxCounts.get(inbox) || 0) + 1);
    }

    const votes = rows.map((vote) => {
      const inbox =
        vote.voter_inbox || canonicalInbox(vote.voter_email) || vote.voter_email;
      return {
        id: vote.id,
        pitch_id: vote.pitch_id,
        user_id: vote.user_id,
        voter_name: vote.voter_name,
        voter_email: vote.voter_email,
        voter_inbox: inbox,
        // Only interesting when it differs from the address itself — that
        // difference is exactly what a sub-address alias looks like.
        is_alias: Boolean(inbox && inbox !== vote.voter_email),
        inbox_votes_in_window: inboxCounts.get(inbox) || 1,
        created_at: vote.created_at,
        ip_address: vote.ip_address,
        user_agent: vote.user_agent,
        geo_country: vote.geo_country,
        geo_region: vote.geo_region,
        geo_city: vote.geo_city,
        voided_at: vote.voided_at,
        voided_by: vote.voided_by,
        void_reason: vote.void_reason,
        pitch_title: vote.pitches?.title || "Untitled pitch",
        pitch_submitter: vote.pitches?.name || "Unknown submitter",
      };
    });

    return NextResponse.json(votes);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Void or restore. Both directions are recorded, because "we took these
// votes off the board" and "we put them back" are equally things you may
// need to prove later.
export async function PATCH(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { action, reason } = body;

    const voteIds = Array.isArray(body.voteIds)
      ? body.voteIds.filter(Boolean)
      : body.voteId
        ? [body.voteId]
        : [];

    if (voteIds.length === 0) {
      return NextResponse.json({ error: "voteIds is required" }, { status: 400 });
    }
    if (action !== "void" && action !== "restore") {
      return NextResponse.json(
        { error: 'action must be "void" or "restore"' },
        { status: 400 }
      );
    }

    const actor = auth.user?.email || "admin";
    const patch =
      action === "void"
        ? {
            voided_at: new Date().toISOString(),
            voided_by: actor,
            void_reason: String(reason || "").trim() || "Voided from the audit trail.",
          }
        : { voided_at: null, voided_by: null, void_reason: null };

    // Voiding is scoped to rows that aren't already in the target state,
    // so a double-click can't overwrite the original reason and actor.
    let query = supabaseAdmin.from("pitch_votes").update(patch).in("id", voteIds);
    query =
      action === "void"
        ? query.is("voided_at", null)
        : query.not("voided_at", "is", null);

    const { data, error } = await query.select("id, pitch_id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action,
      affected: data?.length || 0,
      requested: voteIds.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
