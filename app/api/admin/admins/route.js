import { NextResponse } from "next/server";
import {
  verifyAdmin,
  getHardcodedAdminEmails,
  getDynamicAdminEmails,
} from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";

// Very small helper so we don't accept malformed / non-@umich addresses.
function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// GET — list admins with source ("env" vs "db") so the UI can lock the
// env-hardcoded ones.
export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const hardcoded = getHardcodedAdminEmails();
  const hardcodedSet = new Set(hardcoded);

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("email, added_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dbRows = (data || []).map((row) => ({
    email: row.email,
    source: "db",
    added_by: row.added_by || null,
    created_at: row.created_at,
    removable: !hardcodedSet.has(row.email),
  }));

  const dbEmails = new Set(dbRows.map((r) => r.email));

  const envRows = hardcoded
    .filter((email) => !dbEmails.has(email))
    .map((email) => ({
      email,
      source: "env",
      added_by: null,
      created_at: null,
      removable: false,
    }));

  return NextResponse.json({
    admins: [...envRows, ...dbRows],
    current_user_email: auth.user.email?.toLowerCase() || null,
  });
}

// POST — add a new admin. Requires @umich.edu (matches signup rule).
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

  const email = normalizeEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!email.endsWith("@umich.edu")) {
    return NextResponse.json(
      { error: "Admins must have a @umich.edu email." },
      { status: 400 }
    );
  }

  const hardcoded = getHardcodedAdminEmails();
  if (hardcoded.includes(email)) {
    return NextResponse.json(
      { error: "That email is already an admin via ADMIN_EMAILS." },
      { status: 409 }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .upsert(
      { email, added_by: auth.user.email?.toLowerCase() || null },
      { onConflict: "email" }
    )
    .select("email, added_by, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    admin: {
      email: data.email,
      source: "db",
      added_by: data.added_by,
      created_at: data.created_at,
      removable: true,
    },
  });
}

// DELETE — remove a DB admin. Refuses to remove env-hardcoded emails or
// the caller's own account (foot-gun prevention).
export async function DELETE(request) {
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

  const email = normalizeEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const hardcoded = getHardcodedAdminEmails();
  if (hardcoded.includes(email)) {
    return NextResponse.json(
      { error: "This email is hardcoded via ADMIN_EMAILS and can only be removed by updating the environment." },
      { status: 400 }
    );
  }

  if (auth.user.email?.toLowerCase() === email) {
    return NextResponse.json(
      { error: "You can't remove your own admin access. Ask another admin to do it." },
      { status: 400 }
    );
  }

  // Only allow deleting rows that actually exist in the DB list.
  const dynamic = await getDynamicAdminEmails();
  if (!dynamic.includes(email)) {
    return NextResponse.json({ error: "That admin is not in the manageable list." }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("admin_users")
    .delete()
    .eq("email", email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
