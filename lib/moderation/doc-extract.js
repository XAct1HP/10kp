// Extract plain text from PDF / DOCX / TXT files stored in the Supabase
// `pitch-files` bucket. Used by the text-doc branch of the pipeline.

import { getSupabaseAdmin } from "../supabase.js";

/**
 * @param {{file_path?:string, file_name?:string}} pitch
 * @returns {Promise<string>}
 */
export async function extractDocText(pitch) {
  if (!pitch?.file_path) return "";
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from("pitch-files")
    .download(pitch.file_path);
  if (error || !data) return "";

  const buffer = Buffer.from(await data.arrayBuffer());
  const name = (pitch.file_name || "").toLowerCase();
  try {
    if (name.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text || "";
    }
    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return value || "";
    }
    if (name.endsWith(".txt")) {
      return buffer.toString("utf8");
    }
  } catch (err) {
    console.warn("[moderation.doc-extract] failed", { name, error: err.message });
  }
  return "";
}
