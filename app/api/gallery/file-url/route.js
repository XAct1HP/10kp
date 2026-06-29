import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

// Generate a signed URL for a pitch file (PDF, DOCX, etc.)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from("pitch-files")
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
