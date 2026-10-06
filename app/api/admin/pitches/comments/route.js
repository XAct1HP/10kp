import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";
import { COMMENT_STATUS } from "../../../../../lib/moderation/comments";

export const dynamic = "force-dynamic";

// Admin view of the feedback left on one pitch.
//
// This is the only place the complete record exists. The submitter sees
// approved feedback on their profile; the gallery shows nobody else's at all.
// Here an admin sees every comment in every state — approved, still in
// review, blocked by moderation, and withdrawn by its author — because the
// point is to be able to answer "what did people actually say about this
// pitch", including the things that were stopped.

const SELECT_COLUMNS = [
  "id",
  "pitch_id",
  "user_id",
  "author_name",
  "author_email",
  "body",
  "created_at",
  "updated_at",
  "is_deleted",
  "moderation_status",
  "moderation_summary",
  "moderation_categories",
  "moderation_provider",
  "moderation_checked_at",
  "moderation_reviewed_by",
  "moderation_reviewed_at",
].join(", ");

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

// GET ?pitchId= — every comment on that pitch, newest first.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const pitchId = searchParams.get("pitchId");
  if (!pitchId) {
    return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pitch_comments")
    .select(SELECT_COLUMNS)
    .eq("pitch_id", pitchId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ comments: [], commentsReady: false, counts: {} });
    }
    if (isMissingColumn(error)) {
      return NextResponse.json({
        comments: [],
        commentsReady: false,
        moderationReady: false,
        counts: {},
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const comments = data || [];
  const counts = {
    total: comments.length,
    approved: 0,
    pending: 0,
    blocked: 0,
    withdrawn: 0,
  };
  for (const c of comments) {
    if (c.is_deleted) counts.withdrawn += 1;
    if (c.moderation_status === COMMENT_STATUS.APPROVED) counts.approved += 1;
    else if (c.moderation_status === COMMENT_STATUS.BLOCKED) counts.blocked += 1;
    else counts.pending += 1;
  }

  return NextResponse.json({
    comments: comments.map((c) => ({
      ...c,
      author_handle: String(c.author_email || "").split("@")[0] || c.author_name,
      moderation_categories: Array.isArray(c.moderation_categories)
        ? c.moderation_categories
        : [],
    })),
    commentsReady: true,
    moderationReady: true,
    counts,
  });
}

// PATCH — override a moderation verdict by hand.
// Body: { id, action: "approve" | "block" }
//
// Needed for the two cases automation cannot settle: a comment held because
// the classifier was unsure or unavailable, and a false positive an admin
// wants delivered after reading it.
export async function PATCH(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body?.id;
  const action = String(body?.action || "");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "block") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'block'" },
      { status: 400 }
    );
  }

  const reviewer = auth.user?.email || "admin";
  const now = new Date().toISOString();
  const status =
    action === "approve" ? COMMENT_STATUS.APPROVED : COMMENT_STATUS.BLOCKED;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pitch_comments")
    .update({
      moderation_status: status,
      moderation_summary:
        action === "approve"
          ? `Approved by ${reviewer} after review.`
          : `Blocked by ${reviewer} after review.`,
      moderation_reviewed_by: reviewer,
      moderation_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingColumn(error)) {
      return NextResponse.json(
        {
          error:
            "Comment moderation columns are missing. Run migrations/20261005_comment_moderation.sql.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  return NextResponse.json({
    comment: {
      ...data,
      author_handle: String(data.author_email || "").split("@")[0] || data.author_name,
      moderation_categories: Array.isArray(data.moderation_categories)
        ? data.moderation_categories
        : [],
    },
  });
}
