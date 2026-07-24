# 10KP Content Moderation — Architecture & Operations

This document describes the moderation pipeline that reviews every text,
audio, and video submission before it can appear in the public gallery.

## TL;DR

* Every pitch enters moderation the moment it's submitted. It cannot appear
  in the gallery until `moderation_state = "approved"`.
* Text pitches are moderated by **UMGPT** with the student guidebook.
* Audio pitches upload to **Mux** so we can reuse Mux-generated captions
  as the transcript. The transcript is then moderated by UMGPT.
* Video pitches go through **two** parallel channels: UMGPT on the
  transcript AND Mux Robots (Beta) on the visual frames.
* Ambiguous / failed / borderline pitches are **held for human review**,
  never silently approved and never silently rejected.
* All admin actions are recorded in `moderation_audit`.

---

## Submission lifecycle

```
Student submits
      │
      ▼
Row inserted in `pitches`
   media_status       = uploading
   moderation_state   = not_started
      │
      ├── For text pitches       → /api/intake/moderate → moderation_state = queued
      ├── For text-doc pitches   → /api/intake/moderate → moderation_state = queued
      └── For video / audio      → Mux webhook (video.asset.ready) → moderation_state = queued
                                                            │
                                                            ▼
                                     runModeration(pitchId) [background]
                                                            │
                        ┌──────────────────┬────────────────┼─────────────────────┐
                        ▼                  ▼                ▼                     ▼
                text  (UMGPT)     transcript (UMGPT)   visual (Mux Robots)   [combine]
                                                                                 │
                                                                                 ▼
                                                                       final moderation_state
                                                                          ┌────────────────┐
                                                                          │  approved      │
                                                                          │  needs_review  │
                                                                          │  rejected      │  (only if auto-reject enabled)
                                                                          │  failed        │  (transient — reconciler retries)
                                                                          └────────────────┘
```

## State machine

Two separate state families, on the `pitches` row:

| Column | Values |
|---|---|
| `media_status` | `uploading`, `processing`, `ready`, `errored`, `not_applicable` |
| `transcript_status` | `not_started`, `processing`, `ready`, `not_applicable`, `failed` |
| `moderation_state` | `not_started`, `queued`, `processing`, `approved`, `needs_review`, `rejected`, `failed` |
| `visual_moderation_status` | subset of moderation_state values |
| `transcript_moderation_status` | subset of moderation_state values |

The old single `moderation_status` column is still updated in parallel so
the existing admin UI continues to work; it will be removed in a future
migration.

## Database

Migration: `migrations/20260723_moderation_v2.sql`. Adds:

* State columns above and a check constraint on each.
* Retry bookkeeping (`moderation_attempt_count`, `moderation_next_attempt_at`, `moderation_last_error`).
* Mux Robots fields (`mux_moderation_job_id`, `mux_moderation_result`).
* Sub-component result blobs (`visual_moderation_result`, `transcript_moderation_result`).
* Admin notes column (`moderation_admin_notes`).
* `moderation_audit` table — one row per state transition or admin action.
* `moderation_webhook_events` table — provider + event_id uniqueness for idempotency.
* Extended `pitches_protect_moderation` trigger — students cannot change
  any moderation, transcript, or media column via the client-scoped API.
* Indexes for the review queue and reconciler queries.

## Environment variables

Server-only (never prefix `NEXT_PUBLIC_`):

```
UMGPT_API_KEY
UMGPT_BASE_URL              default https://api.toolkit.umgpt.umich.edu/v1
UMGPT_MODEL                 default gpt-4o
UMGPT_TIMEOUT_MS            default 45000

MUX_TOKEN_ID
MUX_TOKEN_SECRET
MUX_WEBHOOK_SECRET

MODERATION_MUX_ROBOTS       "true" | "false"          default true
MODERATION_AUTO_REJECT      "true" | "false"          default false
MUX_MODERATION_SEXUAL_REVIEW_THRESHOLD     default 0.5
MUX_MODERATION_VIOLENCE_REVIEW_THRESHOLD   default 0.6
MUX_MODERATION_SEXUAL_REJECT_THRESHOLD     default 0.9
MUX_MODERATION_VIOLENCE_REJECT_THRESHOLD   default 0.95
MUX_MODERATION_SAMPLING_INTERVAL_SEC       default 5
MUX_MODERATION_MAX_SAMPLES                 default 240

MODERATION_MAX_ATTEMPTS     default 5
MODERATION_BACKOFF_MS       default 30000
MODERATION_BACKOFF_CAP_MS   default 900000
MODERATION_CRON_SECRET      required to call the reconciler endpoint

MODERATION_DEV_BYPASS       "true" | "false"          default false (dev only)
```

## Mux dashboard configuration

1. Create a signing key: **Settings → Access Tokens → Create Token** (video permissions).
2. Set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.
3. Enable Robots Preview: **Settings → Robots** (Beta — request access if not
   already enabled).
4. Add a webhook: **Settings → Webhooks → Create webhook**
   * URL: `https://<your-domain>/api/webhooks/mux`
   * Events: `video.upload.asset_created`, `video.asset.ready`,
     `video.asset.errored`, `video.upload.errored`,
     `video.asset.track.ready` (for caption-track completion).
5. Copy the signing secret to `MUX_WEBHOOK_SECRET`.

## Supabase configuration

Run migrations in order (Supabase SQL editor):

1. `supabase-setup.sql` (base schema, if not already applied)
2. `migrations/20260612_add_mux_error_to_pitches.sql`
3. `migrations/20260612_create_mux_webhook_logs.sql`
4. `migrations/20260714_add_moderation_to_pitches.sql`
5. `migrations/20260723_moderation_v2.sql`

The v2 migration is idempotent (`add column if not exists` / `create table
if not exists`) and safe to re-run.

RLS policies on `pitches` still use the v1 pattern (students can update
their own rows). The `pitches_protect_moderation` trigger enforces that
every moderation-owned column is server-owned regardless of RLS.

`moderation_audit` and `moderation_webhook_events` have RLS enabled with
no policies — only the service-role client can read/write them.

## Guidebook

The moderator's system prompt embeds an excerpt of
`lib/moderation/policy/guidebook.md`. Replace that file with the
authoritative 10,000 Pitches student guidebook before enabling
automated moderation in production. As long as the file's front-matter says
`version: placeholder-v0` the pipeline attaches a `[POLICY: placeholder]`
marker to every UMGPT prompt so operators can spot the misconfiguration
in the audit trail.

## Text moderation

Path: `/api/intake/moderate` → `enqueueForModeration` → background
`runModeration` → `orchestrateText` → `moderateTextWithUmgpt({ kind: "text" })`.

For PDF/DOCX/TXT documents the pipeline calls `extractDocText` first
(`lib/moderation/doc-extract.js`) so the moderator sees the actual
content, not just the filename.

## Audio moderation

Audio files upload to Mux via `/api/mux/create-upload?kind=audio`. Mux
generates the same captions track it generates for video. When
`video.asset.ready` fires:

1. `runModeration` fetches the auto-generated VTT via `fetchMuxTranscript`.
2. `vttToPlainText` cleans it into a plain string.
3. The transcript goes to UMGPT with `kind: "transcript"`.

Legacy audio uploaded directly to Supabase Storage (i.e., pitches
submitted before this change) is held for human review with an
explanatory summary — the pipeline no longer runs a local Whisper model.

## Video moderation

Two parallel channels, both required:

**Transcript (UMGPT)** — same path as audio.

**Visual (Mux Robots)** — `lib/moderation/mux-visual-moderation.js`:
1. `startVisualModeration(assetId)` creates a `moderate` job with the
   configured thresholds.
2. The job runs asynchronously in Mux. Because Robots does not currently
   emit a dedicated webhook event, the reconciler cron polls
   `mux.robotsPreview.jobs.moderate.retrieve(jobId)` on every tick.
3. When status is `completed`, `normalizeVisualModerationResult` maps
   Mux's scores into a `NormalizedModerationResult`.

## Combining results

`lib/moderation/combiner.js` folds the sub-results into a final decision.
Priority order:

1. Any required channel still processing → `processing` (retry later).
2. Any channel `rejected` + auto-reject on → `rejected`.
3. Any channel `rejected` + auto-reject off → `needs_review`.
4. Any channel `needs_review` → `needs_review`.
5. Any required channel `failed` → `needs_review` (never auto-approve on failure).
6. All channels `approved` → `approved`.

## Webhooks — signatures and idempotency

`/api/webhooks/mux`:

* Verifies the signature against the **raw request body** with
  `mux.webhooks.unwrap`. Invalid signatures → HTTP 400.
* Claims the event in `moderation_webhook_events` via
  `claimWebhookEvent(provider, event_id, event_type, payload)`. Duplicate
  deliveries short-circuit with `{ message: "ok", duplicate: true }`.
* Resolves the pitch by `mux_asset_id` first, then `mux_upload_id`, then
  UUID-shaped `passthrough`. Client-supplied passthrough is never trusted
  when a stronger identifier matches.
* Never overwrites a ready playback ID with a stale `errored` event.
* Returns 500 on handler errors so Mux retries with backoff. The
  idempotency row is marked `failed`, so the next delivery is treated as
  a retry (not a duplicate).

## Retry and reconciliation

Bounded exponential backoff (`lib/moderation/retry.js`):

* `attempt_count` increments on every reservation.
* `next_attempt_at = now + backoffMs * 2^(attempt-1)`, capped at `backoffCapMs`.
* When `attempt_count >= MODERATION_MAX_ATTEMPTS`, the pitch transitions
  to `needs_review` instead of retrying further.

Recovery mechanisms:

1. **Scheduled reconciler** — `POST /api/cron/moderation-reconcile`.
   Requires `Authorization: Bearer $MODERATION_CRON_SECRET`. Picks up:
   * Rows in `queued` with `next_attempt_at <= now`.
   * Rows stuck in `processing` for > 15 minutes.
   Configure a Vercel Cron for every 2–5 minutes.
2. **Admin "Retry moderation" action** — sets the row back to `queued`
   and clears the visual/transcript sub-states, so the pipeline re-runs
   both channels.

## Admin review flow

Admin dashboard (`/admin`):

* Flagged pitches sort to the top (`moderation_priority = 100`).
* Selecting a pitch opens a panel showing:
  * The UMGPT summary and category flags with highlighted evidence.
  * Mux visual scores and flagged thumbnail timestamps.
  * The transcript with highlighted spans.
  * The moderation attempt count and last-error message.
  * The internal-notes editor.
* Actions:
  * **Approve** — sets `moderation_state = approved`.
  * **Reject** — sets `moderation_state = rejected`.
  * **Return to review** — moves a decided pitch back into the review queue.
  * **Retry moderation** — re-runs the pipeline (uses the same enqueue path as intake).
  * **Save note** — records an internal note visible only to admins.

All actions require `verifyAdmin(request)` and write a row into
`moderation_audit`.

## Local development

* Set `MODERATION_DEV_BYPASS=true` (and don't set `NODE_ENV=production`)
  to disable outbound provider calls. The pipeline marks submissions
  `needs_review` with a clear reason so nothing is auto-approved by
  accident.
* Without a Mux dashboard webhook, the intake path still enqueues the
  pitch — the reconciler cron will pick it up when it eventually runs.

## Testing

Run `npm test`. Uses Node's built-in `node:test` runner (no extra deps).
Coverage:

* `combiner.test.js` — decision folding
* `validate.test.js` — UMGPT response schema
* `transcript.test.js` — WebVTT conversion
* `mux-visual.test.js` — Mux Robots score → decision mapping
* `retry.test.js` — backoff calculation and retry classification

External services (UMGPT, Mux, Supabase) are mocked at the module boundary.
Do NOT run tests against the production UMGPT or Mux endpoints.

## Rollback

1. **Disable Mux Robots** — set `MODERATION_MUX_ROBOTS=false`. Video
   pitches will be held for human review instead of using Robots.
2. **Disable moderation entirely (dev only)** — set
   `MODERATION_DEV_BYPASS=true` in a non-production environment.
3. **Drop the v2 columns** — the trigger and columns are `IF EXISTS`
   guarded but the v2 migration does not include a reverse script, since
   it does not remove or rename any existing data. If you must roll back,
   the safest path is to leave the columns in place and revert only the
   application code.

## Known limitations

* **Mux Robots is in Beta.** The API surface may change. Every Robots-
  specific call lives in `lib/moderation/mux-visual-moderation.js` — swap
  that module out to migrate to a different provider.
* **Robots does not emit a webhook.** The reconciler cron is the only
  mechanism that notices a completed job. If the cron doesn't run, video
  visual moderation appears to stall.
* **Vercel serverless timeouts.** Fire-and-forget promises may be killed
  after the HTTP response is flushed. The reconciler cron makes this a
  soft failure rather than a data-loss condition.
* **Legacy audio files** uploaded before the Mux-audio path was
  introduced cannot be transcribed automatically. They enter
  `needs_review` with an explanatory summary.
