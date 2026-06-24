import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// GET — fetch current default thumbnails for audio and text pitches
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("competition_settings")
      .select("default_audio_thumbnail, default_text_thumbnail")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      default_audio_thumbnail: data?.default_audio_thumbnail || null,
      default_text_thumbnail: data?.default_text_thumbnail || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — update default thumbnails
export async function PUT(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { default_audio_thumbnail, default_text_thumbnail } = body;

    const supabaseAdmin = getSupabaseAdmin();

    // Get existing settings row
    const { data: existing } = await supabaseAdmin
      .from("competition_settings")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const updates = {};
    if (default_audio_thumbnail !== undefined) updates.default_audio_thumbnail = default_audio_thumbnail;
    if (default_text_thumbnail !== undefined) updates.default_text_thumbnail = default_text_thumbnail;
    updates.updated_at = new Date().toISOString();

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("competition_settings")
        .update(updates)
        .eq("id", existing.id)
        .select("default_audio_thumbnail, default_text_thumbnail")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    } else {
      const { data, error } = await supabaseAdmin
        .from("competition_settings")
        .insert(updates)
        .select("default_audio_thumbnail, default_text_thumbnail")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
