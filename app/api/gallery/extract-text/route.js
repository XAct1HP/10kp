import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

// Extract text content from a PDF or DOCX file stored in Supabase
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");
    const fileName = searchParams.get("name") || "";

    if (!filePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.storage
      .from("pitch-files")
      .download(filePath);

    if (error) {
      console.error("Supabase download error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    let text = "";

    if (/\.pdf$/i.test(fileName)) {
      // pdf-parse has a known issue loading its test file in some environments
      // Use the underlying pdfjs lib directly as a workaround
      const pdfParse = (await import("pdf-parse")).default;
      try {
        const parsed = await pdfParse(buffer, { max: 0 });
        text = parsed.text;
      } catch (pdfErr) {
        console.error("pdf-parse error:", pdfErr);
        return NextResponse.json({ error: "Failed to parse PDF: " + pdfErr.message }, { status: 500 });
      }
    } else if (/\.docx?$/i.test(fileName)) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (/\.txt$/i.test(fileName)) {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    console.error("extract-text error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
