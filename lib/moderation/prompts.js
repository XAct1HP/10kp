// Prompts and thresholds for the moderation pipeline.
// Conservative posture: only auto-reject on high-confidence high-severity hits;
// anything ambiguous → flag for admin review.

export const MODERATION_CATEGORIES = [
  "sexual_content",
  "graphic_violence",
  "hate_or_harassment",
  "self_harm",
  "illegal_activity",
  "personal_info_leak",
  "other",
];

const TEXT_SYSTEM_PROMPT = `You are a content moderation assistant reviewing student pitch submissions for a University of Michigan competition ("10KP"). Pitches are typically business ideas, research proposals, or creative projects.

Rate the submission for policy-violating content. Categories:
- sexual_content: explicit sexual material or nudity
- graphic_violence: gore, real-world violence, credible threats
- hate_or_harassment: slurs, targeted attacks on protected groups
- self_harm: promotion of suicide or self-injury
- illegal_activity: how-to for illegal acts (drugs, hacking, weapons)
- personal_info_leak: exposed SSN, credit cards, home addresses, private contact info
- other: anything else that shouldn't be in a public university gallery

Return STRICT JSON with this exact shape and nothing else:
{
  "decision": "approve" | "flag" | "reject",
  "confidence": 0.0-1.0,
  "flags": [
    {
      "category": "<one of the categories above>",
      "severity": "low" | "medium" | "high",
      "excerpt": "<the exact substring from the input>",
      "start_char": <0-indexed inclusive>,
      "end_char": <0-indexed exclusive>,
      "reason": "<one short sentence>"
    }
  ]
}

Rules:
- Only include flags for actual concerns. If clean, return an empty flags array.
- start_char/end_char must be valid indices into the input text as given.
- excerpt must exactly match input.slice(start_char, end_char).
- Be conservative on rejection: only "reject" for HIGH severity AND HIGH confidence content. Otherwise "flag" for human review. "approve" if genuinely clean.
- Ordinary business/entrepreneurship discussion is fine even if it mentions e.g. cannabis, firearms, adult products — those are legal industries. Only reject when the content itself is unlawful, hateful, sexually explicit, or violent.
- Never invent quotes. If nothing violating exists, flags must be empty.`;

const VIDEO_FRAMES_SYSTEM_PROMPT = `You are a content moderation assistant reviewing FRAMES SAMPLED FROM A PITCH VIDEO for a University of Michigan competition. The frames are attached as images with timestamps.

Rate them for policy-violating VISUAL content. Categories are the same as text moderation: sexual_content, graphic_violence, hate_or_harassment, self_harm, illegal_activity, personal_info_leak, other.

Return STRICT JSON with this exact shape and nothing else:
{
  "decision": "approve" | "flag" | "reject",
  "confidence": 0.0-1.0,
  "flags": [
    {
      "category": "<category>",
      "severity": "low" | "medium" | "high",
      "timestamp_sec": <number, seconds into the video>,
      "reason": "<one short sentence>"
    }
  ]
}

Rules:
- Be conservative on rejection: only "reject" for HIGH severity AND HIGH confidence visual content (e.g. explicit nudity, graphic gore, on-screen violence). Otherwise "flag".
- Ordinary presentation slides, talking-head videos, product demos, whiteboards, and stock footage are fine.
- timestamp_sec must be one of the timestamps provided with the input frames.
- If nothing violating is visible, flags must be empty.`;

// Build the user message for text moderation. We include the raw text plus an
// explicit character offset guide.
export function buildTextUserMessage({ text, kind }) {
  const preface =
    kind === "transcript"
      ? "Below is a transcript from an audio or video pitch submission."
      : "Below is the written text of a pitch submission.";
  return `${preface}

<<<PITCH_TEXT_START>>>
${text}
<<<PITCH_TEXT_END>>>

Return the strict JSON described in your instructions.`;
}

export function textModerationMessages({ text, kind }) {
  return [
    { role: "system", content: TEXT_SYSTEM_PROMPT },
    { role: "user", content: buildTextUserMessage({ text, kind }) },
  ];
}

export function videoFramesSystemPrompt() {
  return VIDEO_FRAMES_SYSTEM_PROMPT;
}

// Combine two sub-decisions into a final one.
// Conservative: reject wins over flag wins over approve. If either channel
// wants to reject and is highly confident, reject; otherwise flag.
export function combineDecisions(...results) {
  const clean = results.filter(Boolean);
  if (clean.length === 0) {
    return { decision: "approve", confidence: 1, flags: [] };
  }

  const wantsReject = clean.find(
    (r) => r.decision === "reject" && (r.confidence ?? 0) >= 0.85
  );
  if (wantsReject) {
    return {
      decision: "reject",
      confidence: wantsReject.confidence,
      flags: clean.flatMap((r) => r.flags || []),
    };
  }

  const anyReject = clean.find((r) => r.decision === "reject");
  const anyFlag = clean.find((r) => r.decision === "flag");
  if (anyReject || anyFlag) {
    // Downgrade low-confidence reject to a flag — a human decides.
    return {
      decision: "flag",
      confidence: Math.max(...clean.map((r) => r.confidence ?? 0)),
      flags: clean.flatMap((r) => r.flags || []),
    };
  }

  return {
    decision: "approve",
    confidence: Math.min(...clean.map((r) => r.confidence ?? 1)),
    flags: [],
  };
}

// Normalize whatever the model returned to a known-good shape.
export function normalizeResult(raw, { source } = {}) {
  const decision = ["approve", "flag", "reject"].includes(raw?.decision)
    ? raw.decision
    : "flag";
  const confidence =
    typeof raw?.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.5;
  const flags = Array.isArray(raw?.flags)
    ? raw.flags.map((f) => ({
        source,
        category: MODERATION_CATEGORIES.includes(f?.category) ? f.category : "other",
        severity: ["low", "medium", "high"].includes(f?.severity) ? f.severity : "medium",
        excerpt: typeof f?.excerpt === "string" ? f.excerpt : null,
        start_char: Number.isInteger(f?.start_char) ? f.start_char : null,
        end_char: Number.isInteger(f?.end_char) ? f.end_char : null,
        timestamp_sec:
          typeof f?.timestamp_sec === "number" ? f.timestamp_sec : null,
        frame_url: typeof f?.frame_url === "string" ? f.frame_url : null,
        reason: typeof f?.reason === "string" ? f.reason : "",
      }))
    : [];
  return { decision, confidence, flags };
}
