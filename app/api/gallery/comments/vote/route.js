import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/supabase";
import { verifyUser } from "../../../../../lib/userAuth";

export const dynamic = "force-dynamic";

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

// POST — upvote / downvote / clear. Body: { commentId, value: 1 | -1 | 0 }
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isUmichEmail(auth.user.email)) {
    return NextResponse.json(
      { error: "Only @umich.edu accounts can vote on feedback." },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const commentId = body?.commentId;
  const value = Number(body?.value);
  if (!commentId) {
    return NextResponse.json({ error: "commentId is required" }, { status: 400 });
  }
  if (![1, -1, 0].includes(value)) {
    return NextResponse.json(
      { error: "value must be 1 (up), -1 (down), or 0 (clear)." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: comment } = await supabase
    .from("pitch_comments")
    .select("id, is_deleted")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment || comment.is_deleted) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  if (value === 0) {
    const { error } = await supabase
      .from("pitch_comment_votes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", auth.user.id);
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: "Comment votes aren't enabled yet." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("pitch_comment_votes").upsert(
      {
        comment_id: commentId,
        user_id: auth.user.id,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "comment_id,user_id" }
    );
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: "Comment votes aren't enabled yet." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: refreshed } = await supabase
    .from("pitch_comments")
    .select("id, score")
    .eq("id", commentId)
    .maybeSingle();

  return NextResponse.json({
    commentId,
    myVote: value,
    score: refreshed?.score ?? 0,
  });
}
