import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isEmailAdmin } from "../../../../lib/adminAuth";

// GET — returns { isAdmin } for the currently authenticated user.
// Non-admins get { isAdmin: false } rather than 403 so the client can
// safely poll for admin state without treating a normal user as an
// error case.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ isAdmin: false });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return NextResponse.json({ isAdmin: false });
  }

  const isAdmin = await isEmailAdmin(user.email);
  return NextResponse.json({ isAdmin, email: user.email.toLowerCase() });
}
