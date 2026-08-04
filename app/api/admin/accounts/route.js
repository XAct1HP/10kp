import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { listAccountsForOutreach, getResendBroadcastConfig } from "../../../../lib/adminOutreach";

export async function GET(request) {
  const auth = await verifyAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const confirmed = searchParams.get("confirmed");
    const search = searchParams.get("search");

    const supabaseAdmin = getSupabaseAdmin();
    const { accounts, summary, filters } = await listAccountsForOutreach(supabaseAdmin, {
      scope,
      confirmed,
      search,
    });
    const resend = getResendBroadcastConfig();

    return NextResponse.json({
      accounts,
      summary,
      filters,
      resendConfigured: Boolean(resend.apiKey && resend.fromEmail),
      resendFromEmail: resend.fromEmail || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to load accounts." }, { status: 500 });
  }
}
