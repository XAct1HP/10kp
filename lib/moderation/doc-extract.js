// Extract plain text from PDF / DOCX / TXT files stored in the Supabase
// `pitch-files` bucket. Used by the text-doc branch of the pipeline.

import { getSupabaseAdmin } from "../supabase.js";

/**
 * @param {{file_path?:string, file_name?:string}} pitch
 * @returns {Promise<string>}
 */
export async function extractDocText(pitch) {
  const { text } = await extractDocTextDetailed(pitch);
  return text;
}

/**
 * Same as extractDocText, but says whether the file was actually read.
 * `readable: false` means we could not look inside the file (no upload yet,
 * download failed, unsupported format, parser error), which is different
 * from a file that was read and simply has little or no text in it. The
 * minimum-word rule only rejects the second case.
 *
 * @param {{file_path?:string, file_name?:string}} pitch
 * @returns {Promise<{text:string, readable:boolean, error?:string}>}
 */
export async function extractDocTextDetailed(pitch) {
  if (!pitch?.file_path) {
    return { text: "", readable: false, error: "No file has been uploaded for this pitch yet." };
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from("pitch-files")
    .download(pitch.file_path);
  if (error || !data) {
    return { text: "", readable: false, error: `Could not download file: ${error?.message || "no data"}` };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const name = (pitch.file_name || "").toLowerCase();
  try {
    if (name.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      return { text: (Array.isArray(text) ? text.join("\n") : text) || "", readable: true };
    }
    if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return { text: value || "", readable: true };
    }
    if (name.endsWith(".txt")) {
      return { text: buffer.toString("utf8"), readable: true };
    }
  } catch (err) {
    console.warn("[moderation.doc-extract] failed", { name, error: err.message });
    return { text: "", readable: false, error: `Could not read file: ${err.message}` };
  }
  return { text: "", readable: false, error: "Unsupported document type." };
}
