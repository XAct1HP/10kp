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
      const PDFParser = (await import("pdf2json")).default;
      text = await new Promise((resolve, reject) => {
        const parser = new PDFParser();
        parser.on("pdfParser_dataReady", (pdfData) => {
          // pdf2json stores text in pages -> texts array
          // Group text items by Y position to reconstruct lines properly
          const pages = pdfData.Pages || [];
          const allText = pages.map((page) => {
            const texts = page.Texts || [];
            if (texts.length === 0) return "";
            // Sort by Y then X position
            const sorted = texts.slice().sort((a, b) => a.y - b.y || a.x - b.x);
            const lines = [];
            let currentLine = [];
            let currentY = sorted[0]?.y;
            const lineThreshold = 0.5; // Y-distance threshold for same line
            for (const t of sorted) {
              const decoded = (t.R || []).map((r) => decodeURIComponent(r.T)).join("");
              if (Math.abs(t.y - currentY) > lineThreshold) {
                lines.push(currentLine.join(" "));
                currentLine = [decoded];
                currentY = t.y;
              } else {
                currentLine.push(decoded);
              }
            }
            if (currentLine.length) lines.push(currentLine.join(" "));
            // Join lines — detect paragraph breaks (larger Y gaps become double newlines)
            return lines.join("\n");
          }).join("\n\n");
          // Clean up: collapse excessive whitespace within lines
          const cleaned = allText
            .split("\n")
            .map((line) => line.replace(/\s+/g, " ").trim())
            .join("\n")
            .replace(/\n{3,}/g, "\n\n");
          resolve(cleaned);
        });
        parser.on("pdfParser_dataError", (err) => reject(err.parserError || err));
        parser.parseBuffer(buffer);
      });
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
