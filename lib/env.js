// Server-side environment validation.
//
// This module hardcodes every non-secret tunable so operators only need to
// supply the eight secrets (Supabase, UMGPT, Mux, cron). Tuning knobs live
// in the CONSTANTS block below — change them in code, redeploy, done.
//
// If you ever DO need a knob to be per-environment (say, staging vs prod
// with different thresholds), promote the constant back into a process.env
// read here. Nothing else in the codebase reads these values.

// ─── Constants (hardcoded — no env vars) ───────────────────────────────
const UMGPT_BASE_URL_DEFAULT = "https://api.toolkit.umgpt.umich.edu/v1";
const UMGPT_MODEL_DEFAULT    = "gpt-4o";
const UMGPT_TIMEOUT_MS       = 45_000;

// Mux Robots thresholds. Content above the "review" line is held for a
// human. Content above the "reject" line is only auto-rejected when
// AUTO_REJECT below is true — otherwise it's still just held for review.
const VISUAL = Object.freeze({
  reviewSexual:         0.5,
  reviewViolence:       0.6,
  rejectSexual:         0.9,
  rejectViolence:       0.95,
  samplingIntervalSec:  5,
  maxSamples:           240,
});

// Retry / backoff for the pipeline. Attempts are made up to MAX_ATTEMPTS,
// with delay = BACKOFF_MS * 2^(attempt-1) capped at BACKOFF_CAP_MS.
const RETRY = Object.freeze({
  maxAttempts:   5,
  backoffMs:     30_000,
  backoffCapMs:  15 * 60_000,
});

// Feature flags. Both default off; flip them here if/when needed.
const AUTO_REJECT       = false;   // never auto-reject; hold for review
const MUX_ROBOTS_ENABLED = true;   // Beta but stable in our experience
const ALLOW_DEV_BYPASS   = false;  // never enabled — even in dev

// ─── Required env vars ────────────────────────────────────────────────
const REQUIRED_CORE = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const REQUIRED_ADMIN      = ["ADMIN_EMAILS"];
const REQUIRED_MUX        = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET"];
const REQUIRED_MODERATION = ["UMGPT_API_KEY"];

function missing(names) {
  return names.filter((name) => {
    const v = process.env[name];
    return v === undefined || v === null || String(v).trim() === "";
  });
}

/**
 * Throws if any required env vars are missing for the requested modules.
 * @param {{core?:boolean,admin?:boolean,mux?:boolean,moderation?:boolean}} modules
 */
export function assertServerEnv(modules = { core: true }) {
  if (typeof window !== "undefined") {
    throw new Error("assertServerEnv() must only be called from server-side code.");
  }
  const wanted = [];
  if (modules.core !== false) wanted.push(...REQUIRED_CORE);
  if (modules.admin) wanted.push(...REQUIRED_ADMIN);
  if (modules.mux) wanted.push(...REQUIRED_MUX);
  if (modules.moderation) wanted.push(...REQUIRED_MODERATION);
  const gaps = missing(Array.from(new Set(wanted)));
  if (gaps.length > 0) {
    throw new Error(`Missing required server environment variables: ${gaps.join(", ")}`);
  }
}

/**
 * Return validated moderation configuration. Called by every provider
 * adapter. Reads only the required secrets from process.env; every
 * tunable comes from the CONSTANTS block above.
 */
export function getModerationConfig() {
  assertServerEnv({ core: true, mux: true, moderation: true });
  return {
    umgpt: {
      apiKey: process.env.UMGPT_API_KEY,
      baseUrl: UMGPT_BASE_URL_DEFAULT,
      model: UMGPT_MODEL_DEFAULT,
      timeoutMs: UMGPT_TIMEOUT_MS,
    },
    mux: {
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET,
      webhookSecret: process.env.MUX_WEBHOOK_SECRET,
    },
    visual: VISUAL,
    retry: RETRY,
    features: {
      autoReject: AUTO_REJECT,
      muxRobotsEnabled: MUX_ROBOTS_ENABLED,
      allowDevBypass: ALLOW_DEV_BYPASS,
    },
    // Prefer Vercel's convention (CRON_SECRET) — Vercel Cron auto-injects
    // Authorization: Bearer <CRON_SECRET> on scheduled invocations. We
    // still accept MODERATION_CRON_SECRET for backwards compatibility.
    cronSecret: process.env.CRON_SECRET || process.env.MODERATION_CRON_SECRET || null,
  };
}
