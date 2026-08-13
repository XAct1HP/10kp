import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";

// Emails hardcoded via ADMIN_EMAILS env var — the "root" set that can
// never be revoked from the UI. Lowercased and de-duplicated.
export function getHardcodedAdminEmails() {
  return Array.from(
    new Set(
      (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

// Pulls emails from the admin_users table (dynamic admins added via the
// Settings tab). Returns [] if the table doesn't exist yet so the app
// still boots on installations that haven't run the migration.
export async function getDynamicAdminEmails() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("email");
    if (error) return [];
    return (data || []).map((r) => (r.email || "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getAllAdminEmails() {
  const [dynamic] = await Promise.all([getDynamicAdminEmails()]);
  return Array.from(new Set([...getHardcodedAdminEmails(), ...dynamic]));
}

export async function isEmailAdmin(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (getHardcodedAdminEmails().includes(lower)) return true;
  const dynamic = await getDynamicAdminEmails();
  return dynamic.includes(lower);
}

// Verify the request is from an authenticated admin user.
// Returns { user, error, status } — if error is set, return it as the response.
export async function verifyAdmin(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing authorization header", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Create a client scoped to this user's token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized", status: 401 };
  }

  const allowed = await isEmailAdmin(user.email);
  if (!allowed) {
    return { error: "Forbidden — not an admin", status: 403 };
  }

  return { user };
}
