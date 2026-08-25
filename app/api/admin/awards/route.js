import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { decorateSponsor } from "../../../../lib/sponsors";

// `match_criteria` lives in the separate award_criteria table, not on
// `awards`, because `awards` is world-readable and the criteria are the
// rubric the AI relevance check scores against — publishing them would let
// submitters write straight to the answer key. Admin routes reach it through
// the service role, which bypasses RLS.
const AWARD_COLUMNS = `id, name, description, prize, sort_order, is_active, is_raffle,
   created_at, updated_at,
   award_criteria ( criteria ),
   award_sponsors ( sponsor_id, sort_order,
     sponsor:sponsors ( id, name, website, logo_path )
   )`;

// Given an award row with Supabase's nested selects, flatten to the shape the
// client expects: `sponsors: [decoratedSponsor, ...]` and a plain
// `match_criteria` string.
function decorateAward(row) {
  if (!row) return row;
  const joins = (row.award_sponsors || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sponsors = joins
    .map((j) => (j.sponsor ? decorateSponsor(j.sponsor) : null))
    .filter(Boolean);
  const { award_sponsors, award_criteria, ...rest } = row;
  // A one-to-one embed comes back as an object, but PostgREST hands back an
  // array when it can't prove uniqueness. Accept either.
  const criteriaRow = Array.isArray(award_criteria) ? award_criteria[0] : award_criteria;
  return {
    ...rest,
    is_raffle: Boolean(rest.is_raffle),
    match_criteria: criteriaRow?.criteria || "",
    sponsors,
  };
}

// The 20260825 migration adds is_raffle / award_criteria. If this deploy is
// ahead of the database, fall back to the older column set rather than
// blanking the whole Awards panel.
function isMissingSchemaError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST204" ||
    /column .* does not exist/i.test(error?.message || "") ||
    /relation .* does not exist/i.test(error?.message || "") ||
    /Could not find (a relationship|the '.*' column)/i.test(error?.message || "")
  );
}

const LEGACY_AWARD_COLUMNS = `id, name, description, prize, sort_order, is_active,
   created_at, updated_at,
   award_sponsors ( sponsor_id, sort_order,
     sponsor:sponsors ( id, name, website, logo_path )
   )`;

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const run = (columns) =>
      supabaseAdmin
        .from("awards")
        .select(columns)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    let { data, error } = await run(AWARD_COLUMNS);
    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await run(LEGACY_AWARD_COLUMNS));
    }

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

// Write (or clear) the admin-only AI matching criteria. Never fatal: an award
// with no criteria simply falls back to its public description when the
// eligibility engine scores it.
async function saveCriteria(supabaseAdmin, awardId, criteria) {
  const value = typeof criteria === "string" ? criteria.trim() : "";
  const { error } = await supabaseAdmin
    .from("award_criteria")
    .upsert(
      { award_id: awardId, criteria: value || null, updated_at: new Date().toISOString() },
      { onConflict: "award_id" }
    );
  if (error && !isMissingSchemaError(error)) throw new Error(error.message);
}

// Only one award can be the auto-entry raffle. This MUST run before the row
// that claims the flag is written: a partial unique index enforces the rule in
// the database, so writing the second raffle first would just fail.
// `exceptId` is null on create, where there is no new id yet to spare.
async function clearOtherRaffles(supabaseAdmin, exceptId) {
  let query = supabaseAdmin.from("awards").update({ is_raffle: false }).eq("is_raffle", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error && !isMissingSchemaError(error)) throw new Error(error.message);
}

async function fetchAwardWithSponsors(supabaseAdmin, id) {
  const run = (columns) =>
    supabaseAdmin.from("awards").select(columns).eq("id", id).single();

  let { data, error } = await run(AWARD_COLUMNS);
  if (error && isMissingSchemaError(error)) {
    ({ data, error } = await run(LEGACY_AWARD_COLUMNS));
  }
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
    const isRaffle = Boolean(body.is_raffle);
    const sponsorIds = Array.isArray(body.sponsor_ids)
      ? body.sponsor_ids.filter((s) => typeof s === "string")
      : [];

    if (!name) {
      return NextResponse.json({ error: "Award name is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const insert = { name, description, prize, sort_order: sortOrder, is_active: isActive };

    if (isRaffle) await clearOtherRaffles(supabaseAdmin, null);

    let { data, error } = await supabaseAdmin
      .from("awards")
      .insert({ ...insert, is_raffle: isRaffle })
      .select("id")
      .single();

    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await supabaseAdmin
        .from("awards")
        .insert(insert)
        .select("id")
        .single());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await replaceSponsorLinks(supabaseAdmin, data.id, sponsorIds);
    if (body.match_criteria !== undefined) {
      await saveCriteria(supabaseAdmin, data.id, body.match_criteria);
    }
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

    // Free the flag before claiming it — see clearOtherRaffles.
    if (body.is_raffle) await clearOtherRaffles(supabaseAdmin, id);

    const withRaffle = body.is_raffle === undefined
      ? patch
      : { ...patch, is_raffle: Boolean(body.is_raffle) };

    let { error } = await supabaseAdmin.from("awards").update(withRaffle).eq("id", id);
    if (error && isMissingSchemaError(error)) {
      ({ error } = await supabaseAdmin.from("awards").update(patch).eq("id", id));
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (Array.isArray(body.sponsor_ids)) {
      const sponsorIds = body.sponsor_ids.filter((s) => typeof s === "string");
      await replaceSponsorLinks(supabaseAdmin, id, sponsorIds);
    }

    if (body.match_criteria !== undefined) {
      await saveCriteria(supabaseAdmin, id, body.match_criteria);
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
