import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { decorateSponsor } from "../../../../lib/sponsors";

// Keep client-supplied multipliers in a safe range; DB has a matching check.
function clampMultiplier(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(5, Math.max(0.1, n));
}

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .select("id, name, website, logo_path, sort_order, light_background, size_multiplier, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(decorateSponsor));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const website = body.website ? String(body.website).trim() : null;
    const logoPath = body.logo_path ? String(body.logo_path).trim() : null;
    const sortOrder = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;
    const lightBackground = Boolean(body.light_background);
    // size_multiplier defaults to 1.0; clamp to the same range enforced by the DB check.
    const sizeMultiplier = clampMultiplier(body.size_multiplier);

    if (!name) {
      return NextResponse.json({ error: "Sponsor name is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .insert({
        name,
        website,
        logo_path: logoPath,
        sort_order: sortOrder,
        light_background: lightBackground,
        size_multiplier: sizeMultiplier,
      })
      .select("id, name, website, logo_path, sort_order, light_background, size_multiplier, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(decorateSponsor(data));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const patch = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Sponsor name cannot be empty" }, { status: 400 });
      }
      patch.name = trimmed;
    }
    if (body.website !== undefined) {
      patch.website = body.website ? String(body.website).trim() : null;
    }
    if (body.logo_path !== undefined) {
      patch.logo_path = body.logo_path ? String(body.logo_path).trim() : null;
    }
    if (Number.isFinite(body.sort_order)) {
      patch.sort_order = Number(body.sort_order);
    }
    if (body.light_background !== undefined) {
      patch.light_background = Boolean(body.light_background);
    }
    if (body.size_multiplier !== undefined) {
      patch.size_multiplier = clampMultiplier(body.size_multiplier);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("sponsors")
      .update(patch)
      .eq("id", id)
      .select("id, name, website, logo_path, sort_order, light_background, size_multiplier, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(decorateSponsor(data));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Grab the logo_path so we can also purge the storage object.
    const { data: sponsor } = await supabaseAdmin
      .from("sponsors")
      .select("logo_path")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("sponsors").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (sponsor?.logo_path) {
      // Best-effort — don't fail the request if the storage delete errors.
      await supabaseAdmin.storage.from("sponsor-logos").remove([sponsor.logo_path]);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
