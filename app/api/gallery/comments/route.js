import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { verifyUser } from "../../../../lib/userAuth";

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

function displayNameFromUser(user) {
  const meta = user?.user_metadata || {};
  const fromMeta = String(meta.full_name || meta.name || "").trim();
  if (fromMeta) return fromMeta;
  const email = String(user?.email || "");
  const local = email.split("@")[0] || "Wolverine";
  return local;
}

// GET ?pitchId= — public list of comments (newest or top).
// Optional Authorization attaches myVote for the signed-in user.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const pitchId = searchParams.get("pitchId");
    const sort = (searchParams.get("sort") || "top").toLowerCase();
    if (!pitchId) {
      return NextResponse.json({ error: "pitchId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("pitch_comments")
      .select(
        "id, pitch_id, user_id, author_name, author_email, body, score, created_at, updated_at"
      )
      .eq("pitch_id", pitchId)
      .eq("is_deleted", false)
      .limit(200);

    if (sort === "new") {
      query = query.order("created_at", { ascending: false });
    } else {
      query = query
        .order("score", { ascending: false })
        .order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({
          comments: [],
          commentsReady: false,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const comments = data || [];
    let myVotes = {};

    const auth = await verifyUser(request);
    if (!auth.error && auth.user && comments.length) {
      const { data: votes } = await supabase
        .from("pitch_comment_votes")
        .select("comment_id, value")
        .eq("user_id", auth.user.id)
        .in(
          "comment_id",
          comments.map((c) => c.id)
        );
      for (const v of votes || []) {
        myVotes[v.comment_id] = v.value;
      }
    }

    return NextResponse.json({
      comments: comments.map((c) => ({
        ...c,
        // Don't expose full email publicly — keep domain for trust signal only.
        author_email: undefined,
        author_handle: String(c.author_email || "").split("@")[0] || c.author_name,
        myVote: myVotes[c.id] || 0,
      })),
      commentsReady: true,
      canComment: !auth.error && isUmichEmail(auth.user?.email),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — create a comment (requires @umich.edu login).
// Body: { pitchId, body }
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
      { error: "Comment must be between 1 and 2000 characters." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: pitch } = await supabase
    .from("pitches")
    .select("id, moderation_status, is_seed")
    .eq("id", pitchId)
    .maybeSingle();

  if (!pitch || (pitch.moderation_status !== "approved" && !pitch.is_seed)) {
    return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
  }

  const { data: comment, error } = await supabase
    .from("pitch_comments")
    .insert({
      pitch_id: pitchId,
      user_id: auth.user.id,
      author_name: displayNameFromUser(auth.user),
      author_email: String(auth.user.email).toLowerCase(),
      body: text,
      score: 0,
    })
    .select(
      "id, pitch_id, user_id, author_name, author_email, body, score, created_at, updated_at"
    )
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        {
          error:
            "Comments aren't enabled yet. Run migrations/20260928_submitter_profile_comments.sql.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    comment: {
      ...comment,
      author_email: undefined,
      author_handle: String(comment.author_email || "").split("@")[0],
      myVote: 0,
    },
  });
}

// DELETE — soft-delete own comment. Body/query: { id }
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
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
