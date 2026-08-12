import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { decorateSponsor } from "../../../../lib/sponsors";

// Given an array of award rows (each with `award_sponsors: [{sponsor_id, sort_order, sponsor: {...}}]`
// courtesy of Supabase's nested select), flatten to the shape the client
// expects: `sponsors: [decoratedSponsor, ...]`.
function decorateAward(row) {
  if (!row) return row;
  const joins = (row.award_sponsors || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sponsors = joins
    .map((j) => (j.sponsor ? decorateSponsor(j.sponsor) : null))
    .filter(Boolean);
  const { award_sponsors, ...rest } = row;
  return { ...rest, sponsors };
}

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("awards")
      .select(
        `id, name, description, prize, sort_order, is_active, created_at, updated_at,
         award_sponsors ( sponsor_id, sort_order,
           sponsor:sponsors ( id, name, website, logo_path )
         )`
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(decorateAward));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function replaceSponsorLinks(supabaseAdmin, awardId, sponsorIds) {
  await supabaseAdmin.from("award_sponsors").delete().eq("award_id", awardId);
  if (!sponsorIds?.length) return;
  const rows = sponsorIds.map((sponsorId, i) => ({
    award_id: awardId,
    sponsor_id: sponsorId,
    sort_order: i,
  }));
  const { error } = await supabaseAdmin.from("award_sponsors").insert(rows);
  if (error) throw new Error(error.message);
}

async function fetchAwardWithSponsors(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("awards")
    .select(
      `id, name, description, prize, sort_order, is_active, created_at, updated_at,
       award_sponsors ( sponsor_id, sort_order,
         sponsor:sponsors ( id, name, website, logo_path )
       )`
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return decorateAward(data);
}

export async function POST(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const prize = body.prize ? String(body.prize).trim() : null;
    const sortOrder = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;
    const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
    const sponsorIds = Array.isArray(body.sponsor_ids)
      ? body.sponsor_ids.filter((s) => typeof s === "string")
      : [];

    if (!name) {
      return NextResponse.json({ error: "Award name is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("awards")
      .insert({ name, description, prize, sort_order: sortOrder, is_active: isActive })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await replaceSponsorLinks(supabaseAdmin, data.id, sponsorIds);
    const award = await fetchAwardWithSponsors(supabaseAdmin, data.id);
    return NextResponse.json(award);
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
        return NextResponse.json({ error: "Award name cannot be empty" }, { status: 400 });
      }
      patch.name = trimmed;
    }
    if (body.description !== undefined) {
      patch.description = body.description ? String(body.description).trim() : null;
    }
    if (body.prize !== undefined) {
      patch.prize = body.prize ? String(body.prize).trim() : null;
    }
    if (Number.isFinite(body.sort_order)) {
      patch.sort_order = Number(body.sort_order);
    }
    if (body.is_active !== undefined) {
      patch.is_active = Boolean(body.is_active);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("awards").update(patch).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (Array.isArray(body.sponsor_ids)) {
      const sponsorIds = body.sponsor_ids.filter((s) => typeof s === "string");
      await replaceSponsorLinks(supabaseAdmin, id, sponsorIds);
    }

    const award = await fetchAwardWithSponsors(supabaseAdmin, id);
    return NextResponse.json(award);
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
    const { error } = await supabaseAdmin.from("awards").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
