import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { verifyUser } from "../../../../lib/userAuth";
import { moderateCommentBody, COMMENT_STATUS } from "../../../../lib/moderation/comments";

export const dynamic = "force-dynamic";

// Feedback on a pitch is private. It is delivered to the pitch's owner on
// their profile page and visible to admins; nobody else can read it, which is
// why this route never returns another account's comments. A signed-in user
// can see their OWN submissions here so they know a note was recorded and
// where it stands, and that is the only read this endpoint performs.

const SELECT_COLUMNS =
  "id, pitch_id, user_id, author_name, author_email, body, created_at, updated_at, moderation_status, moderation_summary";

function isUmichEmail(email) {
  return /@umich\.edu$/i.test(String(email || "").trim());
}

function isMissingTable(error) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist/i.test(error.message || "") ||
    /Could not find the table/i.test(error.message || "")
  );
}

// The moderation columns arrive in a later migration than the tables, so a
// database that has run 20260928 but not 20261005 must not blank the feature.
function isMissingColumn(error) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message || "") ||
    /Could not find the '.*' column/i.test(error.message || "")
  );
}

function displayNameFromUser(user) {
  const meta = user?.user_metadata || {};
  const fromMeta = String(meta.full_name || meta.name || "").trim();
  if (fromMeta) return fromMeta;
  const email = String(user?.email || "");
  const local = email.split("@")[0] || "Wolverine";
  return local;
}

// What the author is told about their own comment. Deliberately vague about
// the reason for a block: a detailed explanation is a recipe for rewording
// the same abuse past the classifier.
function authorFacingState(status) {
  switch (status) {
    case COMMENT_STATUS.APPROVED:
      return { state: "delivered", note: "Sent to the person who made this pitch." };
    case COMMENT_STATUS.BLOCKED:
      return { state: "blocked", note: "This feedback was not delivered — it was flagged in review." };
    default:
      return { state: "in_review", note: "In review. It will reach the pitch owner once it clears." };
  }
}

function shapeForAuthor(comment) {
  const { state, note } = authorFacingState(comment.moderation_status);
  return {
    id: comment.id,
    pitch_id: comment.pitch_id,
    body: comment.body,
    created_at: comment.created_at,
    state,
    note,
  };
}

// GET ?pitchId= — the signed-in user's own feedback on that pitch, and
// whether they are allowed to leave more. Never returns anyone else's.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const pitchId = searchParams.get("pitchId");
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }

    const auth = await verifyUser(request);
    const signedIn = !auth.error && Boolean(auth.user);
    const canComment = signedIn && isUmichEmail(auth.user.email);

    if (!signedIn) {
      return NextResponse.json({ mine: [], commentsReady: true, canComment: false });
    }

    const supabase = getSupabaseAdmin();
    let { data, error } = await supabase
      .from("pitch_comments")
      .select(SELECT_COLUMNS)
      .eq("pitch_id", pitchId)
      .eq("user_id", auth.user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error && isMissingColumn(error)) {
      // Pre-moderation schema: read what exists and treat it as delivered,
      // which is what it was under the old public model.
      const fallback = await supabase
        .from("pitch_comments")
        .select("id, pitch_id, user_id, body, created_at")
        .eq("pitch_id", pitchId)
        .eq("user_id", auth.user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50);
      data = (fallback.data || []).map((c) => ({
        ...c,
        moderation_status: COMMENT_STATUS.APPROVED,
      }));
      error = fallback.error;
    }

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ mine: [], commentsReady: false, canComment });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      mine: (data || []).map(shapeForAuthor),
      commentsReady: true,
      canComment,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — leave feedback on a pitch (requires @umich.edu login).
// Body: { pitchId, body }
//
// The comment is written first and classified second, so a classifier outage
// can never lose what a student wrote. The row starts `pending`, which is not
// visible to the pitch owner, so nothing is delivered before it is cleared.
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isUmichEmail(auth.user.email)) {
    return NextResponse.json(
      { error: "Only @umich.edu accounts can leave feedback." },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pitchId = body?.pitchId;
  const text = String(body?.body || "").trim();
  if (!pitchId) {
    return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
  }
  if (text.length < 1 || text.length > 2000) {
    return NextResponse.json(
      { error: "Feedback must be between 1 and 2000 characters." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: pitch } = await supabase
    .from("pitches")
    .select("id, user_id, moderation_status, is_seed")
    .eq("id", pitchId)
    .maybeSingle();

  if (!pitch || (pitch.moderation_status !== "approved" && !pitch.is_seed)) {
    return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
  }

  const insert = {
    pitch_id: pitchId,
    user_id: auth.user.id,
    author_name: displayNameFromUser(auth.user),
    author_email: String(auth.user.email).toLowerCase(),
    body: text,
    score: 0,
  };

  let created;
  let { data: comment, error } = await supabase
    .from("pitch_comments")
    .insert({ ...insert, moderation_status: COMMENT_STATUS.PENDING })
    .select(SELECT_COLUMNS)
    .single();

  if (error && isMissingColumn(error)) {
    return NextResponse.json(
      {
        error:
          "Feedback moderation isn't enabled yet. Run migrations/20261005_comment_moderation.sql.",
      },
      { status: 503 }
    );
  }
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        {
          error:
            "Feedback isn't enabled yet. Run migrations/20260928_submitter_profile_comments.sql, then migrations/20261005_comment_moderation.sql.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  created = comment;

  // Classify, then record the verdict. moderateCommentBody never throws — a
  // provider failure returns a `pending` verdict with the reason.
  const verdict = await moderateCommentBody(text);

  const { data: updated } = await supabase
    .from("pitch_comments")
    .update({
      moderation_status: verdict.status,
      moderation_summary: verdict.summary,
      moderation_categories: verdict.categories,
      moderation_provider: verdict.provider,
      moderation_checked_at: verdict.checkedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", created.id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  return NextResponse.json({ comment: shapeForAuthor(updated || created) });
}

// DELETE — soft-delete own feedback. Body/query: { id }
// Soft, not hard: the row stays so the admin record for the pitch is complete.
export async function DELETE(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  let id = searchParams.get("id");
  if (!id) {
    try {
      const body = await request.json();
      id = body?.id;
    } catch {
      // ignore
    }
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pitch_comments")
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
