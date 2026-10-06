import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

function isMissingTable(error) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist/i.test(error.message || "") ||
    /Could not find the table/i.test(error.message || "")
  );
}

function isMissingColumn(error) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message || "") ||
    /Could not find the '.*' column/i.test(error.message || "")
  );
}

// GET — comments across pitches owned by the signed-in submitter.
// Optional ?pitchId= to filter one pitch.
export async function GET(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const pitchId = searchParams.get("pitchId");

  const { data: owned, error: ownedErr } = await auth.supabase
    .from("pitches")
    .select("id, title")
    .eq("user_id", auth.user.id);

  if (ownedErr) {
    return NextResponse.json({ error: ownedErr.message }, { status: 500 });
  }

  const ownedIds = (owned || []).map((p) => p.id);
  const titleById = Object.fromEntries((owned || []).map((p) => [p.id, p.title]));

  if (!ownedIds.length) {
    return NextResponse.json({ comments: [], commentsReady: true });
  }

  if (pitchId && !ownedIds.includes(pitchId)) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }

  // Only approved feedback reaches the submitter. A comment that is still in
  // review, or that moderation blocked, is deliberately invisible here — it
  // exists only in the admin thread for the pitch.
  const supabase = getSupabaseAdmin();
  let { data, error } = await supabase
    .from("pitch_comments")
    .select(
      "id, pitch_id, author_name, author_email, body, created_at, is_deleted, moderation_status"
    )
    .in("pitch_id", pitchId ? [pitchId] : ownedIds)
    .eq("is_deleted", false)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error && isMissingColumn(error)) {
    // 20261005_comment_moderation.sql has not run yet. Rather than show
    // unmoderated feedback, show none and say the migration is pending.
    return NextResponse.json({ comments: [], commentsReady: false });
  }

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ comments: [], commentsReady: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    comments: (data || []).map((c) => ({
      ...c,
      pitch_title: titleById[c.pitch_id] || "Untitled",
      author_handle: String(c.author_email || "").split("@")[0] || c.author_name,
      author_email: undefined,
    })),
    commentsReady: true,
  });
}
