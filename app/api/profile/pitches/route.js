import { NextResponse } from "next/server";
import { verifyUser } from "../../../../lib/userAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

export const dynamic = "force-dynamic";

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .* does not exist/i.test(error?.message || "") ||
    /Could not find the '.*' column of '.*' in the schema cache/i.test(
      error?.message || ""
    )
  );
}

async function fetchOwnerPitches(supabase, userId) {
  const withViews = await supabase
    .from("pitches")
    .select(
      `
      id, name, title, description, file_type, file_name, mux_status,
      mux_playback_id, mux_asset_id, moderation_status, moderation_state,
      thumbnail_path, view_count, is_seed, created_at, winner_year,
      pitch_tags ( tags ( id, name ) )
    `
    )
    .eq("user_id", userId)
    .eq("is_seed", false)
    .order("created_at", { ascending: false });

  if (!withViews.error) {
    return { pitches: withViews.data || [], viewCountReady: true };
  }

  if (!isMissingColumnError(withViews.error)) {
    throw new Error(withViews.error.message);
  }

  const fallback = await supabase
    .from("pitches")
    .select(
      `
      id, name, title, description, file_type, file_name, mux_status,
      mux_playback_id, mux_asset_id, moderation_status, moderation_state,
      thumbnail_path, created_at,
      pitch_tags ( tags ( id, name ) )
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (fallback.error) throw new Error(fallback.error.message);
  return {
    pitches: (fallback.data || []).map((p) => ({
      ...p,
      view_count: 0,
      is_seed: false,
    })),
    viewCountReady: false,
  };
}

// GET — list pitches owned by the signed-in submitter (+ comment counts).
export async function GET(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { pitches, viewCountReady } = await fetchOwnerPitches(
      auth.supabase,
      auth.user.id
    );
    const admin = getSupabaseAdmin();
    const ids = pitches.map((p) => p.id);

    let commentCounts = {};
    let voteCounts = {};
    if (ids.length) {
      // Count only the feedback the submitter can actually read. Counting
      // held or blocked comments here would tell them something was withheld,
      // which is exactly what the moderation step is meant to avoid.
      const [commentRes, { data: voteRows }] = await Promise.all([
        admin
          .from("pitch_comments")
          .select("pitch_id")
          .in("pitch_id", ids)
          .eq("is_deleted", false)
          .eq("moderation_status", "approved"),
        admin.from("pitch_votes").select("pitch_id").in("pitch_id", ids),
      ]);
      // Pre-moderation schema: every surviving comment was visible, so an
      // unfiltered count is the honest answer there.
      let commentRows = commentRes.data;
      if (commentRes.error && isMissingColumnError(commentRes.error)) {
        const legacy = await admin
          .from("pitch_comments")
          .select("pitch_id")
          .in("pitch_id", ids)
          .eq("is_deleted", false);
        commentRows = legacy.data;
      }
      for (const row of commentRows || []) {
        commentCounts[row.pitch_id] = (commentCounts[row.pitch_id] || 0) + 1;
      }
      for (const row of voteRows || []) {
        voteCounts[row.pitch_id] = (voteCounts[row.pitch_id] || 0) + 1;
      }
    }

    const enriched = pitches.map((p) => ({
      ...p,
      tags: (p.pitch_tags || []).map((pt) => pt.tags).filter(Boolean),
      pitch_tags: undefined,
      vote_count: voteCounts[p.id] || 0,
      comment_count: commentCounts[p.id] || 0,
      gallery_path: `/gallery?pitch=${encodeURIComponent(p.id)}`,
    }));

    const { data: settings } = await admin
      .from("competition_settings")
      .select("default_audio_thumbnail, default_text_thumbnail")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      pitches: enriched,
      viewCountReady,
      email: auth.user.email,
      defaults: {
        audioThumbnail: settings?.default_audio_thumbnail || null,
        textThumbnail: settings?.default_text_thumbnail || null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function fetchPitchTags(supabase, pitchId) {
  const { data, error } = await supabase
    .from("pitch_tags")
    .select("tags ( id, name )")
    .eq("pitch_id", pitchId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => row.tags).filter(Boolean);
}

// PATCH — edit title / description / display name / tags on own pitch.
export async function PATCH(request) {
  const auth = await verifyUser(request);
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
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates = {};
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: "Title is too long (max 200)." }, { status: 400 });
    }
    updates.title = title;
  }
  if (typeof body.description === "string") {
    const description = body.description.trim();
    if (!description) {
      return NextResponse.json(
        { error: "Description cannot be empty." },
        { status: 400 }
      );
    }
    if (description.length > 5000) {
      return NextResponse.json(
        { error: "Description is too long (max 5000)." },
        { status: 400 }
      );
    }
    updates.description = description;
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: "Name is too long (max 120)." }, { status: 400 });
    }
    updates.name = name;
  }

  const hasTagUpdate = Array.isArray(body.tagIds);
  if (!Object.keys(updates).length && !hasTagUpdate) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  let tagIds = null;
  if (hasTagUpdate) {
    tagIds = [
      ...new Set(
        body.tagIds
          .filter((tid) => typeof tid === "string" && tid.trim())
          .map((tid) => tid.trim())
      ),
    ];
    if (tagIds.length > 30) {
      return NextResponse.json(
        { error: "Too many tags (max 30)." },
        { status: 400 }
      );
    }
  }

  // Confirm ownership first (also required when only tags change).
  const { data: owned, error: ownedError } = await auth.supabase
    .from("pitches")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (ownedError) {
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }

  let data = null;
  if (Object.keys(updates).length) {
    const { data: updated, error } = await auth.supabase
      .from("pitches")
      .update(updates)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select(
        "id, name, title, description, file_type, mux_status, moderation_status, view_count, created_at"
      )
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error)) {
        const retry = await auth.supabase
          .from("pitches")
          .update(updates)
          .eq("id", id)
          .eq("user_id", auth.user.id)
          .select(
            "id, name, title, description, file_type, mux_status, moderation_status, created_at"
          )
          .maybeSingle();
        if (retry.error) {
          return NextResponse.json({ error: retry.error.message }, { status: 500 });
        }
        if (!retry.data) {
          return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
        }
        data = { ...retry.data, view_count: 0 };
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (!updated) {
      return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
    } else {
      data = updated;
    }
  } else {
    const { data: current, error: currentError } = await auth.supabase
      .from("pitches")
      .select(
        "id, name, title, description, file_type, mux_status, moderation_status, view_count, created_at"
      )
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (currentError) {
      if (isMissingColumnError(currentError)) {
        const retry = await auth.supabase
          .from("pitches")
          .select(
            "id, name, title, description, file_type, mux_status, moderation_status, created_at"
          )
          .eq("id", id)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (retry.error || !retry.data) {
          return NextResponse.json(
            { error: retry.error?.message || "Pitch not found." },
            { status: retry.error ? 500 : 404 }
          );
        }
        data = { ...retry.data, view_count: 0 };
      } else {
        return NextResponse.json({ error: currentError.message }, { status: 500 });
      }
    } else if (!current) {
      return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
    } else {
      data = current;
    }
  }

  let tags = [];
  if (hasTagUpdate) {
    const admin = getSupabaseAdmin();
    if (tagIds.length) {
      const { data: validTags, error: tagLookupError } = await admin
        .from("tags")
        .select("id, name")
        .in("id", tagIds);
      if (tagLookupError) {
        return NextResponse.json({ error: tagLookupError.message }, { status: 500 });
      }
      if ((validTags || []).length !== tagIds.length) {
        return NextResponse.json(
          { error: "One or more tags are invalid." },
          { status: 400 }
        );
      }
      tags = validTags;
    }

    // Service role: users have insert/select RLS on pitch_tags but no delete policy.
    const { error: deleteError } = await admin
      .from("pitch_tags")
      .delete()
      .eq("pitch_id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (tagIds.length) {
      const { error: insertError } = await admin.from("pitch_tags").insert(
        tagIds.map((tag_id) => ({ pitch_id: id, tag_id }))
      );
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  } else {
    try {
      tags = await fetchPitchTags(auth.supabase, id);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ pitch: { ...data, tags } });
}

// DELETE — remove own pitch (and associated media / join rows).
// Query: ?id=<pitchId>
export async function DELETE(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  let pitchId = searchParams.get("id");
  if (!pitchId) {
    try {
      const body = await request.json();
      pitchId = body?.id;
    } catch {
      // ignore
    }
  }
  if (!pitchId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Ownership check with the user-scoped client first.
  const { data: owned, error: ownedError } = await auth.supabase
    .from("pitches")
    .select("id, file_path, thumbnail_path, mux_asset_id, is_seed, user_id")
    .eq("id", pitchId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (ownedError) {
    // Pre-migration installs may lack is_seed — retry without it.
    if (isMissingColumnError(ownedError)) {
      const retry = await auth.supabase
        .from("pitches")
        .select("id, file_path, thumbnail_path, mux_asset_id, user_id")
        .eq("id", pitchId)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      if (!retry.data) {
        return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
      }
      return deleteOwnedPitch(retry.data);
    }
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }
  if (owned.is_seed) {
    return NextResponse.json(
      { error: "Archive / winner pitches can't be deleted here." },
      { status: 403 }
    );
  }

  return deleteOwnedPitch(owned);
}

async function deleteOwnedPitch(pitch) {
  const admin = getSupabaseAdmin();
  const pitchId = pitch.id;

  // Best-effort cleanup of related rows (FKs may cascade depending on migration).
  await Promise.allSettled([
    admin.from("pitch_votes").delete().eq("pitch_id", pitchId),
    admin.from("pitch_tags").delete().eq("pitch_id", pitchId),
    admin.from("pitch_awards").delete().eq("pitch_id", pitchId),
    admin.from("pitch_comments").delete().eq("pitch_id", pitchId),
    admin.from("pitch_views").delete().eq("pitch_id", pitchId),
  ]);

  if (pitch.file_path) {
    try {
      await admin.storage.from("pitch-files").remove([pitch.file_path]);
    } catch (err) {
      console.error("[profile/pitches] file cleanup", err?.message || err);
    }
  }

  if (pitch.thumbnail_path) {
    try {
      const thumbPath = storageObjectPath(pitch.thumbnail_path, "thumbnails");
      if (thumbPath) {
        await admin.storage.from("thumbnails").remove([thumbPath]);
      }
    } catch (err) {
      console.error("[profile/pitches] thumbnail cleanup", err?.message || err);
    }
  }

  const { error } = await admin.from("pitches").delete().eq("id", pitchId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (pitch.mux_asset_id) {
    try {
      const mux = getMuxClient();
      await mux.video.assets.delete(pitch.mux_asset_id);
    } catch (muxErr) {
      console.error("[profile/pitches] Mux cleanup", muxErr?.message || muxErr);
    }
  }

  return NextResponse.json({ success: true, id: pitchId });
}

function storageObjectPath(value, bucket) {
  const raw = String(value || "");
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return raw;
  const marker = `/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(raw.slice(idx + marker.length).split("?")[0]);
}

// Optional: mux video views for a single owned pitch via ?id=&mux=1
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const pitchId = body?.id;
  if (!pitchId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: pitch, error } = await auth.supabase
    .from("pitches")
    .select("id, title, mux_asset_id, view_count")
    .eq("id", pitchId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      const fallback = await auth.supabase
        .from("pitches")
        .select("id, title, mux_asset_id")
        .eq("id", pitchId)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (fallback.error || !fallback.data) {
        return NextResponse.json(
          { error: fallback.error?.message || "Pitch not found." },
          { status: fallback.error ? 500 : 404 }
        );
      }
      return analyticsPayload(fallback.data, auth.user.id, { view_count: 0 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pitch) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }

  return analyticsPayload(pitch, auth.user.id);
}

async function analyticsPayload(pitch, _userId, overrides = {}) {
  let muxViews = null;
  let muxWatchTime = null;
  if (pitch.mux_asset_id) {
    try {
      const mux = getMuxClient();
      const views = await mux.data.videoViews.list({
        filters: [`asset_id:${pitch.mux_asset_id}`],
        limit: 100,
      });
      const viewData = views.data || [];
      muxViews = viewData.length;
      muxWatchTime = viewData.reduce(
        (s, v) => s + (v.total_watch_time || v.watch_time || 0),
        0
      );
    } catch (err) {
      console.error("[profile/pitches] mux analytics", err?.message || err);
    }
  }

  const admin = getSupabaseAdmin();
  const [{ count: commentCount }, { count: voteCount }] = await Promise.all([
    admin
      .from("pitch_comments")
      .select("id", { count: "exact", head: true })
      .eq("pitch_id", pitch.id)
      .eq("is_deleted", false),
    admin
      .from("pitch_votes")
      .select("id", { count: "exact", head: true })
      .eq("pitch_id", pitch.id),
  ]);

  return NextResponse.json({
    pitchId: pitch.id,
    galleryViews: overrides.view_count ?? pitch.view_count ?? 0,
    voteCount: voteCount || 0,
    commentCount: commentCount || 0,
    muxViews,
    muxWatchTime,
  });
}
