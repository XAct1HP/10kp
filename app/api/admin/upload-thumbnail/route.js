import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// POST — upload a default thumbnail image (admin only)
export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const type = formData.get("type"); // "audio" or "text"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!["audio", "text"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'audio' or 'text'" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const ext = file.name.split(".").pop() || "png";
    const filePath = `defaults/default_${type}_thumbnail.${ext}`;

    // Upload to thumbnails bucket (overwrite if exists)
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from("thumbnails")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("thumbnails")
      .getPublicUrl(filePath);

    // Update competition_settings
    const column = type === "audio" ? "default_audio_thumbnail" : "default_text_thumbnail";
    const { data: existing } = await supabaseAdmin
      .from("competition_settings")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const updates = {
      [column]: urlData.publicUrl,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabaseAdmin.from("competition_settings").update(updates).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("competition_settings").insert(updates);
    }

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
