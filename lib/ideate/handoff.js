// Ideate → intake hand-off.
//
// A finished idea can be carried into the submission form so the student
// doesn't retype it. This only works for a WRITTEN pitch: there is no
// recording to hand over, so the hand-off pre-selects the intake form's text
// mode and fills Floor 3 (title, description) and Floor 5 (the pitch itself).
// Recording is still the pitch 10KP prefers — see the summary screen, where
// this sits below "go record it", not instead of it.
//
// The payload travels through sessionStorage rather than the URL: a pitch
// outline is far longer than a query string should carry, and it must not end
// up in browser history or a shared link. It is read once and cleared.

import { PITCH_BEATS, problemSentence } from "./curriculum.js";

export const HANDOFF_KEY = "10kp.ideate.intake-prefill";

// Long enough to walk over from /ideate, short enough that a forgotten tab
// doesn't silently fill a form days later.
export const HANDOFF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const PITCH_MAX = 8000;

const filled = (s) => typeof s === "string" && s.trim().length > 0;
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const block = (s) => String(s || "").replace(/[ \t]+/g, " ").trim();

// Build the fields the intake form will pick up. Pure, so it can be tested
// without a browser.
export function buildIntakePrefill(data) {
  const d = data || {};
  const chosen = d.stretch?.ideas?.[d.stretch?.chosen];
  const title = oneLine(chosen?.text || d.spark?.idea).slice(0, TITLE_MAX);

  const statementReady = filled(d.dig?.who) && filled(d.dig?.what) && filled(d.dig?.why);
  const description = [
    statementReady ? `The problem: ${problemSentence(d)}` : "",
    filled(d.stretch?.solution) ? `The solution: ${block(d.stretch.solution)}` : "",
    filled(d.who?.person) ? `Who it's for: ${block(d.who.person)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, DESCRIPTION_MAX);

  // The five beats in order, as paragraphs — it reads as the script the
  // student would speak, which is exactly what the text pitch field wants.
  const pitchText = PITCH_BEATS.map((b) => block(d.pitch?.[b.id]))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, PITCH_MAX);

  return { title, description, pitchText };
}

// Stash it and report whether it landed. Returns false when sessionStorage is
// unavailable (private mode, storage blocked) so the caller can still navigate
// rather than appearing to do nothing.
export function stashIntakePrefill(data) {
  const payload = { ...buildIntakePrefill(data), at: Date.now() };
  if (!payload.pitchText && !payload.title) return false;
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

// Read it once, then clear it: a reload of the intake form should not fight
// with edits the student has already made.
export function takeIntakePrefill() {
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(HANDOFF_KEY);
    if (raw) window.sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > HANDOFF_MAX_AGE_MS) return null;

  const title = oneLine(parsed.title).slice(0, TITLE_MAX);
  const description = String(parsed.description || "").slice(0, DESCRIPTION_MAX);
  const pitchText = String(parsed.pitchText || "").slice(0, PITCH_MAX);
  if (!title && !description && !pitchText) return null;

  return { title, description, pitchText };
}
