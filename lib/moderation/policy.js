// Policy / guidebook loader.
//
// Reads the authoritative 10KP student guidebook from
// `lib/moderation/policy/`. Accepts either:
//   * `guidebook.md`   — Markdown / plain text (preferred, easy to diff)
//   * `guidebook.pdf`  — the original PDF as distributed by the university
//                        (extracted at cold start via `unpdf`)
//
// If both exist, the Markdown file wins. Drop in only one of them.
//
// Cached in memory for the lifetime of the Node process.

import fs from "node:fs/promises";
import path from "node:path";

const POLICY_DIR = path.join(process.cwd(), "lib", "moderation", "policy");
const MD_PATH  = path.join(POLICY_DIR, "guidebook.md");
const PDF_PATH = path.join(POLICY_DIR, "guidebook.pdf");
const MAX_EXCERPT_CHARS = 6000;

let cache = null;

async function loadMarkdown() {
  try {
    const text = await fs.readFile(MD_PATH, "utf8");
    return { text, source: "guidebook.md" };
  } catch {
    return null;
  }
}

async function loadPdf() {
  try {
    const buffer = await fs.readFile(PDF_PATH);
    const { extractText } = await import("unpdf");
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    const flat = Array.isArray(text) ? text.join("\n") : text || "";
    return { text: flat, source: "guidebook.pdf" };
  } catch (err) {
    return { error: err.message };
  }
}

function detectPlaceholder(text) {
  return /^# .*placeholder/im.test(text) ||
    /POLICY-METADATA[\s\S]*version:\s*placeholder/i.test(text);
}

async function loadFromDisk() {
  const md = await loadMarkdown();
  if (md) {
    return {
      text: md.text,
      isPlaceholder: detectPlaceholder(md.text),
      source: md.source,
      loadedAt: new Date().toISOString(),
    };
  }
  const pdf = await loadPdf();
  if (pdf && !pdf.error && pdf.text.trim()) {
    return {
      text: pdf.text,
      isPlaceholder: detectPlaceholder(pdf.text),
      source: pdf.source,
      loadedAt: new Date().toISOString(),
    };
  }
  return {
    text: "(Guidebook file missing - automated moderation cannot check policy-specific rules. Route all submissions to human review.)",
    isPlaceholder: true,
    source: "missing",
    loadedAt: new Date().toISOString(),
    loadError: (pdf && pdf.error) || "no guidebook.md or guidebook.pdf found",
  };
}

export async function getPolicy() {
  if (!cache) cache = await loadFromDisk();
  return cache;
}

export async function getPolicyExcerpt() {
  const policy = await getPolicy();
  const excerpt = policy.text.slice(0, MAX_EXCERPT_CHARS);
  const banner = policy.isPlaceholder
    ? "[POLICY: placeholder (" + policy.source + ") - flag anything ambiguous for human review]\n\n"
    : "[POLICY: authoritative guidebook excerpt (" + policy.source + ")]\n\n";
  return banner + excerpt;
}

export function resetPolicyCache() {
  cache = null;
}
