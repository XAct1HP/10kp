import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";

// PATCH /api/admin/pitches/moderation
// Body: { pitchId: string, decision: "approve" | "reject", note?: string }
// Admin manually overrides the moderation decision on a pitch.
export async function PATCH(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { pitchId, decision, note } = await request.json();
    if (!pitchId || !["approve", "reject"].includes(decision)) {
      return NextResponse.json(
        { error: "pitchId and decision (approve|reject) are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const update = {
      moderation_status: decision === "approve" ? "approved" : "rejected",
      moderation_priority: 0,
      moderation_reviewed_by: auth.user.email,
      moderation_reviewed_at: now,
    };
    if (note) update.moderation_reason = note;

    const { data, error } = await supabaseAdmin
      .from("pitches")
      .update(update)
      .eq("id", pitchId)
      .select(
        "id, moderation_status, moderation_reason, moderation_reviewed_by, moderation_reviewed_at, moderation_priority"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ pitch: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
