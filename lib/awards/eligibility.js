// Award-track eligibility.
//
// A submitter picks the awards they want their pitch considered for. That is
// a request, not an entitlement — nothing stops someone from ticking every
// box. Once moderation APPROVES a pitch, this module scores the pitch's own
// words (transcript for media, text for written submissions) against each
// award's admin-written criteria and drops the tracks it doesn't fit.
//
// Posture, in order of importance:
//   * A pitch is only ever removed from a track on a clear, confident
//     no. Ambiguity keeps the student in the running — a wrongly dropped
//     entry is a much worse failure here than a wrongly kept one.
//   * A provider outage never removes anything. Rows go `eligible` with
//     decision `unverified` so an admin can see the check didn't run.
//   * An admin override is final. Rows carrying `overridden_by` are never
//     re-decided.
//   * The raffle (awards.is_raffle) is auto-entry: never offered on the
//     intake form, never scored.

import { getSupabaseAdmin } from "../supabase.js";
import { getModerationConfig } from "../env.js";

const MAX_PITCH_CHARS = 12_000;
const MAX_CRITERIA_CHARS = 2_000;

export const AWARD_STATUS = Object.freeze({
  PENDING: "pending",
  ELIGIBLE: "eligible",
  REMOVED: "removed",
});

export const MATCH_DECISION = Object.freeze({
  MATCH: "match",
  NO_MATCH: "no_match",
  UNVERIFIED: "unverified",
});

class EligibilityTransientError extends Error {
  constructor(message) {
    super(message);
    this.name = "EligibilityTransientError";
    this.retryable = true;
  }
}

// ─── Prompt construction (pure — unit tested) ──────────────────────────

/**
 * The text we judge a pitch by. Media pitches are judged on their Mux
 * transcript; written ones on their body text. Title and description are
 * always included because they carry the framing.
 */
export function buildPitchContent(pitch) {
  return [pitch?.title, pitch?.description, pitch?.text_content, pitch?.transcript]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_PITCH_CHARS);
}

function truncate(value, max) {
  const str = String(value || "").trim();
  return str.length <= max ? str : `${str.slice(0, max)}...`;
}

/**
 * An award with no criteria and no description has nothing to score against.
 * Rather than let the model invent a rubric, we accept the selection and mark
 * it unverified so admins can see which awards need criteria written.
 */
export function awardRubric(award) {
  return truncate(award?.criteria || award?.description || "", MAX_CRITERIA_CHARS);
}

export function buildEligibilityMessages({ pitchContent, awards }) {
  const system = [
    "You decide whether a student's pitch belongs in the award tracks they",
    "asked to be considered for, at the University of Michigan 10,000 Pitches",
    "competition. You are not judging quality, polish, or how likely the pitch",
    "is to win — only whether its SUBJECT MATTER fits what each award is for.",
    "",
    "For each award you return one verdict:",
    '  "match"    — the pitch plausibly satisfies what the award is looking for.',
    '  "no_match" — the pitch clearly is not about what this award is for.',
    "",
    "Rules, in order:",
    "  1. Default to \"match\". Only return \"no_match\" when the pitch clearly",
    "     fails the award's stated subject matter — not when it is merely a",
    "     weaker or less obvious fit. Removing a student from a track they",
    "     belong in is far worse than leaving a marginal one in.",
    "  2. Judge only against the criteria given for that award. Do not import",
    "     requirements the criteria do not state.",
    "  3. An early-stage, vague, or briefly-explained pitch still matches if",
    "     its subject matter fits. Lack of detail is not grounds for no_match.",
    "  4. Ground every verdict in what the pitch actually says. Never invent",
    "     quotes or assume unstated facts about the idea.",
    "  5. Judge each award independently.",
    "",
    "Output STRICT JSON only, in this exact shape:",
    "",
    "{",
    '  "results": [',
    "    {",
    '      "award_id": "<the id given for that award>",',
    '      "verdict": "match" | "no_match",',
    '      "confidence": 0.0 - 1.0,',
    '      "reason": "one short sentence, citing what in the pitch decided it"',
    "    }",
    "  ]",
    "}",
    "",
    "Return exactly one result per award listed, using the ids as given.",
  ].join("\n");

  const awardBlock = awards
    .map((award, i) => {
      const rubric = awardRubric(award);
      return [
        `AWARD ${i + 1}`,
        `id: ${award.id}`,
        `name: ${award.name}`,
        `criteria: ${rubric || "(none provided — accept unless the pitch is plainly unrelated to the award's name)"}`,
      ].join("\n");
    })
    .join("\n\n");

  const user = [
    "Here is the student's pitch.",
    "",
    "<<<PITCH_START>>>",
    pitchContent,
    "<<<PITCH_END>>>",
    "",
    "They asked to be considered for the following award(s):",
    "",
    awardBlock,
    "",
    "Return the strict JSON described in your instructions.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ─── Response normalization (pure — unit tested) ───────────────────────

/**
 * Turn whatever the model returned into a verdict per requested award id.
 * Anything missing, unparseable, or unrecognized comes back `unverified`,
 * which the caller treats as "leave the student in the track".
 *
 * @param {any} raw            parsed model JSON
 * @param {string[]} awardIds  the ids we asked about
 * @returns {Map<string, {verdict:string, confidence:number|null, reason:string}>}
 */
export function normalizeEligibilityResults(raw, awardIds) {
  const byId = new Map();
  const results = Array.isArray(raw?.results) ? raw.results : [];

  for (const entry of results) {
    const id = typeof entry?.award_id === "string" ? entry.award_id : null;
    if (!id || !awardIds.includes(id) || byId.has(id)) continue;

    const verdict = entry?.verdict === MATCH_DECISION.NO_MATCH
      ? MATCH_DECISION.NO_MATCH
      : entry?.verdict === MATCH_DECISION.MATCH
      ? MATCH_DECISION.MATCH
      // An unrecognized verdict is not a removal signal.
      : MATCH_DECISION.UNVERIFIED;

    const confidence = typeof entry?.confidence === "number" && Number.isFinite(entry.confidence)
      ? Math.max(0, Math.min(1, entry.confidence))
      : null;

    byId.set(id, {
      verdict,
      confidence,
      reason: typeof entry?.reason === "string" ? entry.reason.trim().slice(0, 500) : "",
    });
  }

  // Any award the model skipped keeps its track.
  for (const id of awardIds) {
    if (!byId.has(id)) {
      byId.set(id, {
        verdict: MATCH_DECISION.UNVERIFIED,
        confidence: null,
        reason: "The relevance check returned no verdict for this award.",
      });
    }
  }

  return byId;
}

/**
 * Map a verdict onto the row update. Only a confident `no_match` removes a
 * pitch from a track; everything else leaves it in.
 */
export function verdictToRow(verdict, { now } = {}) {
  const at = now || new Date().toISOString();
  const removed = verdict.verdict === MATCH_DECISION.NO_MATCH;
  return {
    status: removed ? AWARD_STATUS.REMOVED : AWARD_STATUS.ELIGIBLE,
    match_decision: verdict.verdict,
    match_confidence: verdict.confidence,
    match_reason: verdict.reason || null,
    checked_at: at,
  };
}

// ─── UMGPT call ────────────────────────────────────────────────────────

async function scoreWithUmgpt(messages) {
  const config = getModerationConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.umgpt.timeoutMs);

  let res;
  try {
    res = await fetch(`${config.umgpt.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.umgpt.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.umgpt.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new EligibilityTransientError(
      err?.name === "AbortError"
        ? `Relevance check timed out after ${config.umgpt.timeoutMs}ms`
        : `Relevance check network error: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await res.text();
  if (res.status === 429 || res.status >= 500) {
    throw new EligibilityTransientError(`UMGPT ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`UMGPT ${res.status}: ${body.slice(0, 200)}`);
  }

  let envelope;
  try {
    envelope = JSON.parse(body);
  } catch {
    throw new Error("UMGPT returned a non-JSON envelope");
  }
  const content = envelope?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("UMGPT response missing message content");
  }

  try {
    return JSON.parse(content);
  } catch {
    const salvaged = content.match(/\{[\s\S]*\}/);
    if (salvaged) {
      try {
        return JSON.parse(salvaged[0]);
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Could not parse relevance JSON: ${content.slice(0, 200)}`);
  }
}

// ─── Orchestration ─────────────────────────────────────────────────────

async function markRows(supabase, pitchId, awardIds, patch) {
  if (!awardIds.length) return;
  await supabase
    .from("pitch_awards")
    .update(patch)
    .eq("pitch_id", pitchId)
    .in("award_id", awardIds);
}

/**
 * Score every pending award track on a pitch.
 *
 * No-ops unless the pitch is APPROVED — an unapproved pitch is not in any
 * track, so there is nothing to decide yet. Safe to call repeatedly; only
 * `pending` rows without an admin override are touched.
 *
 * @returns {Promise<{skipped?:string, evaluated?:number, removed?:number, kept?:number}>}
 */
export async function evaluateAwardEligibility(pitchId, { supabase: injected } = {}) {
  const supabase = injected || getSupabaseAdmin();

  const { data: pitch, error: pitchErr } = await supabase
    .from("pitches")
    .select("id, title, description, text_content, transcript, moderation_state, moderation_status")
    .eq("id", pitchId)
    .single();

  if (pitchErr || !pitch) return { skipped: "pitch-not-found" };

  const approved =
    pitch.moderation_state === "approved" || pitch.moderation_status === "approved";
  if (!approved) return { skipped: "not-approved" };

  const { data: rows, error: rowsErr } = await supabase
    .from("pitch_awards")
    .select("award_id, status, checked_at, overridden_by")
    .eq("pitch_id", pitchId)
    .eq("status", AWARD_STATUS.PENDING)
    .is("overridden_by", null);

  // The 20260825 migration may not have run yet — that is not an error worth
  // failing moderation over.
  if (rowsErr) return { skipped: `pitch_awards unavailable: ${rowsErr.message}` };
  if (!rows?.length) return { skipped: "nothing-pending" };

  const { data: awardRows, error: awardsErr } = await supabase
    .from("awards")
    .select("id, name, description, is_raffle, is_active, award_criteria ( criteria )")
    .in("id", rows.map((r) => r.award_id));

  if (awardsErr) return { skipped: `awards unavailable: ${awardsErr.message}` };

  const awards = (awardRows || []).map((a) => {
    const criteriaRow = Array.isArray(a.award_criteria) ? a.award_criteria[0] : a.award_criteria;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      is_raffle: Boolean(a.is_raffle),
      criteria: criteriaRow?.criteria || "",
    };
  });

  const now = new Date().toISOString();

  // The raffle is auto-entry — it should never have been selectable, but if a
  // row exists anyway, honor it without scoring.
  const raffleIds = awards.filter((a) => a.is_raffle).map((a) => a.id);
  await markRows(supabase, pitchId, raffleIds, {
    status: AWARD_STATUS.ELIGIBLE,
    match_decision: MATCH_DECISION.MATCH,
    match_confidence: 1,
    match_reason: "Automatic entry — every approved pitch is included.",
    checked_at: now,
  });

  const scorable = awards.filter((a) => !a.is_raffle);
  if (!scorable.length) return { evaluated: raffleIds.length, removed: 0, kept: raffleIds.length };

  const pitchContent = buildPitchContent(pitch);
  const scorableIds = scorable.map((a) => a.id);

  // No usable pitch text (a media pitch whose transcript never landed, say).
  // Nothing to judge against — keep the tracks and flag it for an admin.
  if (!pitchContent) {
    await markRows(supabase, pitchId, scorableIds, {
      status: AWARD_STATUS.ELIGIBLE,
      match_decision: MATCH_DECISION.UNVERIFIED,
      match_confidence: null,
      match_reason: "No pitch text or transcript was available to check against this award.",
      checked_at: now,
    });
    return { evaluated: scorableIds.length, removed: 0, kept: scorableIds.length, unverified: true };
  }

  let raw;
  try {
    raw = await scoreWithUmgpt(buildEligibilityMessages({ pitchContent, awards: scorable }));
  } catch (err) {
    // First failure: leave the rows pending so the reconciler retries.
    // `checked_at` is our attempt marker — if it is already set, this is the
    // second miss, so stop retrying and leave the student in the track.
    const alreadyTried = rows.some((r) => r.checked_at);
    if (err.retryable && !alreadyTried) {
      await markRows(supabase, pitchId, scorableIds, {
        checked_at: now,
        match_reason: `Relevance check failed, will retry: ${String(err.message).slice(0, 200)}`,
      });
      return { skipped: "provider-error-will-retry", error: err.message };
    }
    await markRows(supabase, pitchId, scorableIds, {
      status: AWARD_STATUS.ELIGIBLE,
      match_decision: MATCH_DECISION.UNVERIFIED,
      match_confidence: null,
      match_reason: `Relevance check unavailable (${String(err.message).slice(0, 160)}). Kept pending admin review.`,
      checked_at: now,
    });
    return { evaluated: scorableIds.length, removed: 0, kept: scorableIds.length, unverified: true };
  }

  const verdicts = normalizeEligibilityResults(raw, scorableIds);
  let removed = 0;
  let kept = 0;

  for (const [awardId, verdict] of verdicts) {
    const patch = verdictToRow(verdict, { now });
    if (patch.status === AWARD_STATUS.REMOVED) removed += 1;
    else kept += 1;
    await supabase
      .from("pitch_awards")
      .update(patch)
      .eq("pitch_id", pitchId)
      .eq("award_id", awardId)
      .is("overridden_by", null);
  }

  return { evaluated: verdicts.size, removed, kept: kept + raffleIds.length };
}

/**
 * Fire-and-forget wrapper for callers that must not block on the check
 * (the moderation pipeline). The reconciler cron re-runs anything left
 * pending, so a lost background promise is recoverable.
 */
export function evaluateAwardEligibilityInBackground(pitchId) {
  evaluateAwardEligibility(pitchId).catch((err) => {
    console.error("[awards.eligibility] background run failed", {
      pitchId,
      error: err.message,
    });
  });
}
