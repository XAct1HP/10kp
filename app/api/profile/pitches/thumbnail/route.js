import { NextResponse } from "next/server";
import { verifyUser } from "../../../../../lib/userAuth";
import { getSupabaseAdmin } from "../../../../../lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_BYTES = 5 * 1024 * 1024;

function storageObjectPath(value, bucket) {
  const raw = String(value || "");
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return raw;
  const marker = `/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(raw.slice(idx + marker.length).split("?")[0]);
}

function safeExt(file) {
  const fromName = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const type = String(file?.type || "");
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "jpg";
}

// POST — replace thumbnail on an owned pitch (multipart: id + file)
export async function POST(request) {
  const auth = await verifyUser(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const id = String(formData.get("id") || "").trim();
  const file = formData.get("file");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!file || typeof file === "string" || !file.size) {
    return NextResponse.json({ error: "No image file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Thumbnail must be PNG, JPG, GIF, or WebP." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Thumbnail must be 5MB or smaller." },
      { status: 400 }
    );
  }

  const { data: owned, error: ownedError } = await auth.supabase
    .from("pitches")
    .select("id, thumbnail_path, is_seed, user_id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (ownedError) {
    // Pre-migration installs may lack is_seed — retry without it.
    if (
      ownedError?.code === "42703" ||
      ownedError?.code === "PGRST204" ||
      /column .* does not exist/i.test(ownedError?.message || "")
    ) {
      const retry = await auth.supabase
        .from("pitches")
        .select("id, thumbnail_path, user_id")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      if (!retry.data) {
        return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
      }
      return uploadThumbnail(auth.user.id, retry.data, file);
    }
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }
  if (owned.is_seed) {
    return NextResponse.json(
      { error: "Archive / winner pitches can't be edited here." },
      { status: 403 }
    );
  }

  return uploadThumbnail(auth.user.id, owned, file);
}

async function uploadThumbnail(userId, pitch, file) {
  const admin = getSupabaseAdmin();
  const ext = safeExt(file);
  const objectPath = `${userId}/${pitch.id}/thumbnail_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("thumbnails")
    .upload(objectPath, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage
    .from("thumbnails")
    .getPublicUrl(objectPath);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    return NextResponse.json(
      { error: "Failed to resolve thumbnail URL." },
      { status: 500 }
    );
  }

  const { data: updated, error: updateError } = await admin
    .from("pitches")
    .update({ thumbnail_path: publicUrl })
    .eq("id", pitch.id)
    .eq("user_id", userId)
    .select("id, thumbnail_path")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }

  // Best-effort cleanup of the previous custom thumbnail (skip if same path).
  const oldPath = storageObjectPath(pitch.thumbnail_path, "thumbnails");
  if (oldPath && oldPath !== objectPath && !oldPath.startsWith("defaults/")) {
    try {
      await admin.storage.from("thumbnails").remove([oldPath]);
    } catch (err) {
      console.error(
        "[profile/pitches/thumbnail] cleanup",
        err?.message || err
      );
    }
  }

  return NextResponse.json({
    success: true,
    pitch: { id: updated.id, thumbnail_path: updated.thumbnail_path },
  });
}
