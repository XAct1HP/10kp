import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { getMuxClient } from "../../../../lib/mux";

export const runtime = "nodejs";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000")
  );
}

// Postgres undefined_column (42703) or PostgREST schema-cache miss (PGRST204)
// when winner_year / winner_award_id haven't been migrated yet.
function isMissingWinnerColumn(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message || "";
  return (
    /column .* does not exist/i.test(msg) ||
    /Could not find the '.*' column of '.*' in the schema cache/i.test(msg)
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE_SEED_SELECT =
  "id, name, title, description, mux_status, mux_playback_id, mux_asset_id, mux_error, created_at, is_seed";
const WINNER_SEED_SELECT = `${BASE_SEED_SELECT}, winner_year, winner_award_id, winner_award:awards!winner_award_id ( id, name, sort_order )`;

// Null or integer in [1900, 2200]. Empty string / undefined → null.
function parseWinnerYear(raw) {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1900 || n > 2200) {
    return { error: "winnerYear must be an integer between 1900 and 2200." };
  }
  return { value: n };
}

// Null or UUID string that exists in awards. Empty string / undefined → null.
async function parseAwardId(raw, supabaseAdmin) {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  const id = String(raw).trim();
  if (!UUID_RE.test(id)) {
    return { error: "awardId must be a valid UUID." };
  }
  const { data, error } = await supabaseAdmin
    .from("awards")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "awardId does not match an existing award." };
  }
  return { value: id };
}

// GET — list existing seed pitches (past-winner videos) for the admin
// panel. Kept separate from /api/admin/pitches so the admin UI doesn't
// have to filter a mixed list.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const withMeta = await supabaseAdmin
    .from("pitches")
    .select(WINNER_SEED_SELECT)
    .eq("is_seed", true)
    .order("created_at", { ascending: false });

  if (!withMeta.error) {
    return NextResponse.json({
      pitches: withMeta.data || [],
      winnerMetaReady: true,
    });
  }

  // Pre-migration fallback — columns aren't there yet, so retry without
  // them and tell the UI to hide year/award editors.
  if (isMissingWinnerColumn(withMeta.error)) {
    const fallback = await supabaseAdmin
      .from("pitches")
      .select(BASE_SEED_SELECT)
      .eq("is_seed", true)
      .order("created_at", { ascending: false });

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    return NextResponse.json({
      pitches: fallback.data || [],
      winnerMetaReady: false,
    });
  }

  return NextResponse.json({ error: withMeta.error.message }, { status: 500 });
}

// POST — create a seed pitch row and mint a Mux direct-upload URL.
// The row is marked approved on both moderation columns so the pipeline
// leaves it alone and it appears in the gallery as soon as Mux finishes
// processing.
export async function POST(request) {
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

  const title = (body?.title || "").trim();
  const name = (body?.name || "").trim();
  const description = (body?.description || "").trim();

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Submitter name is required." }, { status: 400 });

  const yearParsed = parseWinnerYear(body?.winnerYear);
  if (yearParsed.error) {
    return NextResponse.json({ error: yearParsed.error }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const awardParsed = await parseAwardId(body?.awardId, supabaseAdmin);
  if (awardParsed.error) {
    return NextResponse.json({ error: awardParsed.error }, { status: 400 });
  }

  const baseRow = {
    user_id: auth.user.id,
    name,
    title,
    description: description || "Past winner from a previous 10K Pitches competition.",
    file_type: "video",
    file_name: `${title} (past winner)`,
    is_seed: true,
    // Skip the moderation pipeline entirely — service role bypasses the
    // pitches_protect_moderation trigger so these writes stick.
    moderation_status: "approved",
    moderation_state: "approved",
    moderation_source: "seed",
    moderation_summary: "Seed pitch — past-year winner uploaded by admin.",
    visual_moderation_status: "not_applicable",
    transcript_moderation_status: "not_applicable",
    transcript_status: "not_applicable",
    media_status: "uploading",
    mux_status: "uploading",
  };

  // Insert the pitch row first so we can pass its UUID to Mux as
  // passthrough — matching the pattern used for regular pitches.
  let pitch;
  let insertError;
  {
    const withMeta = await supabaseAdmin
      .from("pitches")
      .insert({
        ...baseRow,
        winner_year: yearParsed.value,
        winner_award_id: awardParsed.value,
      })
      .select("id")
      .single();

    if (withMeta.error && isMissingWinnerColumn(withMeta.error)) {
      // Migration not applied yet — still create the seed so the admin
      // isn't blocked; year/award will be editable after the migration.
      const fallback = await supabaseAdmin
        .from("pitches")
        .insert(baseRow)
        .select("id")
        .single();
      pitch = fallback.data;
      insertError = fallback.error;
    } else {
      pitch = withMeta.data;
      insertError = withMeta.error;
    }
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const mux = getMuxClient();
    const upload = await mux.video.uploads.create({
      cors_origin: siteUrl(),
      new_asset_settings: {
        passthrough: pitch.id,
        playback_policies: ["public"],
        video_quality: "basic",
        // Seed pitches don't need captions for moderation (they skip the
        // pipeline entirely) but auto-subs are still nice for the gallery
        // player, so we generate them.
        inputs: [
          {
            generated_subtitles: [
              { language_code: "en", name: "English (auto)" },
            ],
          },
        ],
      },
    });

    const { error: updateError } = await supabaseAdmin
      .from("pitches")
      .update({ mux_upload_id: upload.id })
      .eq("id", pitch.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      pitchId: pitch.id,
      uploadUrl: upload.url,
      uploadId: upload.id,
    });
  } catch (err) {
    // Roll back the pitch row so a Mux failure doesn't leave a stranded
    // "uploading" seed pitch cluttering the list.
    await supabaseAdmin.from("pitches").delete().eq("id", pitch.id);
    return NextResponse.json(
      { error: err.message || "Failed to create Mux upload." },
      { status: 500 }
    );
  }
}

// PATCH — edit seed-pitch metadata (title/name/description/year/award).
// Refuses non-seed rows. If winner columns aren't migrated yet, returns
// 409 so the admin knows to run migrations/20260818_add_winner_metadata.sql.
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

  const pitchId = body?.id;
  if (!pitchId) {
    return NextResponse.json({ error: "Missing pitch id" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("pitches")
    .select("id, is_seed")
    .eq("id", pitchId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }
  if (!existing.is_seed) {
    return NextResponse.json(
      { error: "Refusing to edit a non-seed pitch through this endpoint." },
      { status: 400 }
    );
  }

  const updates = {};

  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    updates.title = title;
  }
  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description = String(body.description || "").trim() || null;
  }
  if (body.winnerYear !== undefined) {
    const yearParsed = parseWinnerYear(body.winnerYear);
    if (yearParsed.error) {
      return NextResponse.json({ error: yearParsed.error }, { status: 400 });
    }
    updates.winner_year = yearParsed.value;
  }
  if (body.awardId !== undefined) {
    const awardParsed = await parseAwardId(body.awardId, supabaseAdmin);
    if (awardParsed.error) {
      return NextResponse.json({ error: awardParsed.error }, { status: 400 });
    }
    updates.winner_award_id = awardParsed.value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data: pitch, error: updateError } = await supabaseAdmin
    .from("pitches")
    .update(updates)
    .eq("id", pitchId)
    .select(WINNER_SEED_SELECT)
    .single();

  if (updateError) {
    if (isMissingWinnerColumn(updateError)) {
      return NextResponse.json(
        {
          error:
            "Winner year/award columns are missing. Run migrations/20260818_add_winner_metadata.sql (and 20260819_winner_award_category.sql if needed), then try again.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ pitch });
}

// DELETE — remove a seed pitch (and its Mux asset). Refuses to delete
// non-seed rows so this endpoint can never touch real submissions.
export async function DELETE(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const pitchId = searchParams.get("id");
  if (!pitchId) {
    return NextResponse.json({ error: "Missing pitch id" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: pitch, error: fetchError } = await supabaseAdmin
    .from("pitches")
    .select("id, is_seed, mux_asset_id")
    .eq("id", pitchId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!pitch) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }
  if (!pitch.is_seed) {
    return NextResponse.json(
      { error: "Refusing to delete a non-seed pitch through this endpoint." },
      { status: 400 }
    );
  }

  await supabaseAdmin.from("pitch_votes").delete().eq("pitch_id", pitchId);
  await supabaseAdmin.from("pitch_tags").delete().eq("pitch_id", pitchId);

  const { error: deleteError } = await supabaseAdmin
    .from("pitches")
    .delete()
    .eq("id", pitchId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (pitch.mux_asset_id) {
    try {
      const mux = getMuxClient();
      await mux.video.assets.delete(pitch.mux_asset_id);
    } catch (muxErr) {
      // Non-fatal — the DB row is gone; Mux storage will linger until
      // manually purged. Log so ops notices.
      console.error("[seed-pitches.delete] Mux asset cleanup failed", {
        pitchId,
        assetId: pitch.mux_asset_id,
        error: muxErr.message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
