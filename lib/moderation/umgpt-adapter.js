// UMGPT moderation adapter.
//
// Wraps the U-M GPT Toolkit chat-completions endpoint with:
//   * bounded timeout (AbortController)
//   * JSON response-format enforcement
//   * structural validation via lib/moderation/validate.js
//   * normalized NormalizedModerationResult output
//   * defensive posture: any malformed / uncertain / timed-out response is
//     surfaced as `failed` — never silently as `approved`
//
// Provider-specific quirks live only inside this module. Callers see the
// stable NormalizedModerationResult shape from lib/moderation/types.js.

import { getModerationConfig } from "../env.js";
import { getPolicyExcerpt } from "./policy.js";
import { validateUmgptModerationJson, SchemaError } from "./validate.js";
import { PROVIDER } from "./types.js";

const MAX_INPUT_CHARS = 12_000;

// ─── Prompts ───────────────────────────────────────────────────────────
// Kept in this module so prompt tweaks stay with the adapter that owns them.

function buildSystemPrompt(policyExcerpt) {
  return [
    "You are a content-moderation reviewer for a University of Michigan",
    "student pitch competition (10,000 Pitches, or 10KP). You classify a",
    "student's submission against the university's student guidebook AND",
    "the following universal safety categories:",
    "",
    "  harassment            — abusive language directed at a person or group",
    "  hate                  — slurs or targeted attacks on a protected class",
    "  sexual_content        — nudity or graphic sexual descriptions",
    "  graphic_violence      — gore, credible threats, glorified violence",
    "  self_harm             — promotion of suicide, self-injury, disordered eating",
    "  dangerous_or_illegal  — how-to for weapons, drugs, hacking, fraud",
    "  personal_info_leak    — third-party home addresses, IDs, financial info",
    "  spam_or_irrelevant    — not the student's own work, unrelated promotion",
    "  guidebook_violation   — violates a rule stated in the guidebook below",
    "  other                 — anything else unsuitable for a public gallery",
    "",
    "STUDENT GUIDEBOOK EXCERPT:",
    "----------------------------------------------------------------",
    policyExcerpt,
    "----------------------------------------------------------------",
    "",
    "Decision rules:",
    "  * decision = 'approved'      — the submission is clearly acceptable.",
    "  * decision = 'needs_review'  — anything ambiguous, borderline, or a",
    "                                 low-confidence policy concern.",
    "  * decision = 'rejected'      — HIGH-severity, HIGH-confidence content",
    "                                 that is clearly disallowed (e.g. explicit",
    "                                 sexual content, credible threats,",
    "                                 concrete weapon instructions).",
    "",
    "IMPORTANT:",
    "  * Do NOT flag a pitch merely because it mentions a sensitive topic in",
    "    a legitimate academic, entrepreneurial, medical, historical,",
    "    journalistic, or public-safety context.",
    "  * Base every flag on actual evidence from the submission. Never invent",
    "    quotes.",
    "  * If you cannot decide, choose 'needs_review'.",
    "",
    "Output STRICT JSON only, matching this exact shape:",
    "",
    "{",
    '  "decision": "approved" | "needs_review" | "rejected",',
    '  "summary": "one short sentence describing the outcome",',
    '  "categories": [',
    "    {",
    '      "category": "<one of the categories above>",',
    '      "flagged": true,',
    '      "severity": "low" | "medium" | "high",',
    '      "confidence": 0.0 - 1.0,',
    '      "explanation": "why this category was flagged",',
    '      "evidence": ["short excerpt from the submission"]',
    "    }",
    "  ],",
    '  "guidebook_violations": [',
    "    {",
    '      "rule": "brief rule name from the guidebook",',
    '      "explanation": "how the submission violates that rule",',
    '      "evidence": ["short excerpt"]',
    "    }",
    "  ]",
    "}",
    "",
    "Return { \"decision\": \"approved\", \"summary\": \"clean\", ",
    "\"categories\": [], \"guidebook_violations\": [] } for clean input.",
  ].join("\n");
}

function buildUserPrompt({ kind, text }) {
  const cropped = text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS) + "\n\n[... input truncated for length]"
    : text;
  const preface = kind === "transcript"
    ? "The following is a transcript of the pitch's audio track."
    : kind === "text-doc"
    ? "The following text was extracted from the student's attached document."
    : "The following is the student's written pitch.";
  return [
    preface,
    "",
    "<<<PITCH_START>>>",
    cropped,
    "<<<PITCH_END>>>",
    "",
    "Return the strict JSON described in your instructions.",
  ].join("\n");
}

// ─── Low-level HTTP call ───────────────────────────────────────────────
async function chatCompletion({ messages, model, apiKey, baseUrl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("UMGPT timeout")), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new UmgptTransientError(`UMGPT request timed out after ${timeoutMs}ms`);
    }
    throw new UmgptTransientError(`UMGPT network error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  const bodyText = await res.text();
  if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
    throw new UmgptTransientError(`UMGPT ${res.status}: ${bodyText.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new UmgptPermanentError(`UMGPT ${res.status}: ${bodyText.slice(0, 300)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new UmgptPermanentError("UMGPT returned non-JSON envelope");
  }
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new UmgptPermanentError("UMGPT response missing message content");
  }
  return { content, model: parsed?.model || model };
}

export class UmgptTransientError extends Error {
  constructor(message) {
    super(message);
    this.name = "UmgptTransientError";
    this.retryable = true;
  }
}
export class UmgptPermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = "UmgptPermanentError";
    this.retryable = false;
  }
}

function parseModelJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    // Salvage the first {...} block, mirroring old lib/moderation/umgpt.js.
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    throw new UmgptPermanentError("Could not parse UMGPT JSON: " + content.slice(0, 300));
  }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Moderate a string via UMGPT. `kind` selects the wording of the prompt
 * preface ("text", "transcript", "text-doc") but the schema is identical
 * across kinds.
 *
 * @param {{text:string, kind:"text"|"transcript"|"text-doc"}} args
 * @returns {Promise<import("./types.js").NormalizedModerationResult>}
 */
export async function moderateTextWithUmgpt({ text, kind }) {
  const config = getModerationConfig();
  const provider = kind === "transcript"
    ? PROVIDER.UMGPT_TRANSCRIPT
    : PROVIDER.UMGPT_TEXT;

  const cleaned = (text || "").trim();
  if (!cleaned) {
    return {
      decision: "approved",
      summary: "Empty submission — no textual content to moderate.",
      categories: [],
      guidebookViolations: [],
      provider,
      providerVersion: config.umgpt.model,
      completedAt: new Date().toISOString(),
    };
  }

  const policyExcerpt = await getPolicyExcerpt();
  const messages = [
    { role: "system", content: buildSystemPrompt(policyExcerpt) },
    { role: "user", content: buildUserPrompt({ kind, text: cleaned }) },
  ];

  const { content, model } = await chatCompletion({
    messages,
    model: config.umgpt.model,
    apiKey: config.umgpt.apiKey,
    baseUrl: config.umgpt.baseUrl,
    timeoutMs: config.umgpt.timeoutMs,
  });

  const raw = parseModelJson(content);
  let validated;
  try {
    validated = validateUmgptModerationJson(raw);
  } catch (err) {
    if (err instanceof SchemaError) {
      // Malformed structured output — never silently approve. Surface as
      // failed so the pipeline routes the pitch to needs_review or retry.
      return {
        decision: "failed",
        summary: `UMGPT response failed schema validation: ${err.message}`,
        categories: [],
        guidebookViolations: [],
        provider,
        providerVersion: model,
        completedAt: new Date().toISOString(),
        providerRaw: raw,
      };
    }
    throw err;
  }

  return {
    decision: validated.decision,
    summary: validated.summary || `UMGPT decision: ${validated.decision}`,
    categories: validated.categories,
    guidebookViolations: validated.guidebookViolations,
    provider,
    providerVersion: model,
    completedAt: new Date().toISOString(),
    providerRaw: raw,
  };
}
