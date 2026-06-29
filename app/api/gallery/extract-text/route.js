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
      const unpdf = await import("unpdf");
      const uint8 = new Uint8Array(buffer);
      const result = await unpdf.extractText(uint8);
      // Handle all possible return shapes
      if (typeof result === "string") {
        text = result;
      } else if (Array.isArray(result)) {
        text = result.join("\n\n");
      } else if (result && typeof result === "object") {
        if (typeof result.text === "string") {
          text = result.text;
        } else if (Array.isArray(result.text)) {
          text = result.text.join("\n\n");
        } else if (Array.isArray(result.pages)) {
          text = result.pages.map((p) => (typeof p === "string" ? p : String(p))).join("\n\n");
        } else {
          // Last resort: log and stringify
          console.log("unpdf unexpected shape:", JSON.stringify(result).slice(0, 500));
          text = JSON.stringify(result);
        }
      } else {
        text = String(result || "");
      }
    } else if (/\.docx?$/i.test(fileName)) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    } else if (/\.txt$/i.test(fileName)) {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    // Clean up: join all lines into one flowing block of text
    let finalText = typeof text === "string" ? text : String(text || "");
    finalText = finalText
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return NextResponse.json({ text: finalText });
  } catch (err) {
    console.error("extract-text error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
