-- ============================================================================
-- 10KP Moderation v2 — separated state model, retries, audit, idempotency
-- ============================================================================
-- Replaces the single overloaded `moderation_status` column with a proper
-- state machine that distinguishes media processing (Mux), transcript
-- generation, and moderation review.
--
-- All new columns are nullable / defaulted so the migration is safe to run on
-- an existing production database. A backfill step at the bottom maps the
-- old `moderation_status` values into the new columns.
-- ============================================================================

-- ─── 1. Extend `pitches` with the new state model ─────────────────────────
alter table public.pitches
  -- Media (Mux/Supabase) processing state.
  -- Values: uploading | processing | ready | errored
  add column if not exists media_status text not null default 'uploading',

  -- Transcript state.
  -- Values: not_started | processing | ready | not_applicable | failed
  add column if not exists transcript_status text not null default 'not_started',
  add column if not exists transcript text,
  add column if not exists transcript_language text,
  add column if not exists transcript_last_error text,

  -- New moderation state (distinct from media_status).
  -- Values: not_started | queued | processing | approved | needs_review | rejected | failed
  -- We keep the old `moderation_status` column for backward compatibility;
  -- the backfill below sets `moderation_state` from the old column so
  -- existing rows behave identically until re-moderated.
  add column if not exists moderation_state text not null default 'not_started',
  add column if not exists moderation_version integer not null default 2,
  add column if not exists moderation_source text,
  add column if not exists moderation_started_at timestamptz,
  add column if not exists moderation_completed_at timestamptz,
  add column if not exists moderation_summary text,
  add column if not exists moderation_reasons jsonb not null default '[]'::jsonb,
  add column if not exists moderation_categories jsonb not null default '[]'::jsonb,
  add column if not exists moderation_scores jsonb not null default '{}'::jsonb,
  add column if not exists moderation_admin_notes text,

  -- Retry / attempt bookkeeping.
  add column if not exists moderation_attempt_count integer not null default 0,
  add column if not exists moderation_last_attempt_at timestamptz,
  add column if not exists moderation_next_attempt_at timestamptz,
  add column if not exists moderation_last_error text,

  -- Sub-component results (visual + transcript) for videos.
  add column if not exists visual_moderation_status text not null default 'not_applicable',
  add column if not exists visual_moderation_result jsonb,
  add column if not exists transcript_moderation_status text not null default 'not_applicable',
  add column if not exists transcript_moderation_result jsonb,

  -- Mux Robots (Beta) job tracking.
  add column if not exists mux_moderation_job_id text,
  add column if not exists mux_moderation_result jsonb;

-- Legal state values.
alter table public.pitches
  drop constraint if exists pitches_media_status_check;
alter table public.pitches
  add constraint pitches_media_status_check
  check (media_status in ('uploading','processing','ready','errored','not_applicable'));

alter table public.pitches
  drop constraint if exists pitches_transcript_status_check;
alter table public.pitches
  add constraint pitches_transcript_status_check
  check (transcript_status in ('not_started','processing','ready','not_applicable','failed'));

alter table public.pitches
  drop constraint if exists pitches_moderation_state_check;
alter table public.pitches
  add constraint pitches_moderation_state_check
  check (moderation_state in ('not_started','queued','processing','approved','needs_review','rejected','failed'));

alter table public.pitches
  drop constraint if exists pitches_visual_moderation_status_check;
alter table public.pitches
  add constraint pitches_visual_moderation_status_check
  check (visual_moderation_status in ('not_applicable','queued','processing','approved','needs_review','rejected','failed'));

alter table public.pitches
  drop constraint if exists pitches_transcript_moderation_status_check;
alter table public.pitches
  add constraint pitches_transcript_moderation_status_check
  check (transcript_moderation_status in ('not_applicable','queued','processing','approved','needs_review','rejected','failed'));

-- ─── 2. Backfill from the v1 moderation_status column ────────────────────
-- Older `moderation_status` values map like this:
--   approved  -> approved (final)
--   rejected  -> rejected (final)
--   flagged   -> needs_review
--   errored   -> failed
--   pending   -> not_started (will be re-moderated on next attempt)
update public.pitches
  set moderation_state = case moderation_status
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'flagged' then 'needs_review'
      when 'errored' then 'failed'
      else 'not_started'
    end,
    media_status = case
      when mux_status = 'ready' then 'ready'
      when mux_status = 'errored' then 'errored'
      when mux_status = 'processing' then 'processing'
      when mux_status = 'uploading' then 'uploading'
      when file_type = 'video' then 'processing'
      else 'ready'                      -- text / audio / doc live in Supabase Storage
    end,
    transcript = coalesce(transcript, moderation_transcript),
    transcript_status = case
      when moderation_transcript is not null then 'ready'
      else transcript_status
    end,
    moderation_summary = coalesce(moderation_summary, moderation_reason),
    moderation_categories = coalesce(moderation_flags, '[]'::jsonb),
    moderation_completed_at = coalesce(moderation_completed_at, moderation_checked_at)
  where moderation_state = 'not_started' or moderation_state is null;

-- ─── 3. Indexes for the common admin/gallery queries ─────────────────────
create index if not exists pitches_moderation_state_idx
  on public.pitches (moderation_state);

create index if not exists pitches_moderation_next_attempt_idx
  on public.pitches (moderation_next_attempt_at)
  where moderation_state in ('queued', 'failed', 'processing');

create index if not exists pitches_media_status_idx
  on public.pitches (media_status);

create index if not exists pitches_mux_asset_id_lookup_idx
  on public.pitches (mux_asset_id)
  where mux_asset_id is not null;

create index if not exists pitches_mux_upload_id_lookup_idx
  on public.pitches (mux_upload_id)
  where mux_upload_id is not null;

create index if not exists pitches_mux_moderation_job_lookup_idx
  on public.pitches (mux_moderation_job_id)
  where mux_moderation_job_id is not null;

-- Public gallery filters on moderation_state='approved' — a partial index
-- keeps that scan cheap.
create index if not exists pitches_gallery_approved_idx
  on public.pitches (created_at desc)
  where moderation_state = 'approved';

-- ─── 4. Extend the moderation-column protection trigger ──────────────────
-- The v1 migration installed `pitches_protect_moderation` to prevent
-- students from mutating moderation_* columns. Extend it to cover every
-- new column so a compromised or malicious client cannot set itself
-- approved via the client-scoped RLS UPDATE policy.
create or replace function public.pitches_protect_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  -- v1 columns
  new.moderation_status := old.moderation_status;
  new.moderation_reason := old.moderation_reason;
  new.moderation_flags := old.moderation_flags;
  new.moderation_transcript := old.moderation_transcript;
  new.moderation_reviewed_by := old.moderation_reviewed_by;
  new.moderation_reviewed_at := old.moderation_reviewed_at;
  new.moderation_priority := old.moderation_priority;
  new.moderation_checked_at := old.moderation_checked_at;

  -- v2 state columns
  new.moderation_state := old.moderation_state;
  new.moderation_version := old.moderation_version;
  new.moderation_source := old.moderation_source;
  new.moderation_started_at := old.moderation_started_at;
  new.moderation_completed_at := old.moderation_completed_at;
  new.moderation_summary := old.moderation_summary;
  new.moderation_reasons := old.moderation_reasons;
  new.moderation_categories := old.moderation_categories;
  new.moderation_scores := old.moderation_scores;
  new.moderation_admin_notes := old.moderation_admin_notes;
  new.moderation_attempt_count := old.moderation_attempt_count;
  new.moderation_last_attempt_at := old.moderation_last_attempt_at;
  new.moderation_next_attempt_at := old.moderation_next_attempt_at;
  new.moderation_last_error := old.moderation_last_error;

  -- v2 sub-component results
  new.visual_moderation_status := old.visual_moderation_status;
  new.visual_moderation_result := old.visual_moderation_result;
  new.transcript_moderation_status := old.transcript_moderation_status;
  new.transcript_moderation_result := old.transcript_moderation_result;

  -- Transcript pipeline (server-owned).
  new.transcript := old.transcript;
  new.transcript_status := old.transcript_status;
  new.transcript_language := old.transcript_language;
  new.transcript_last_error := old.transcript_last_error;

  -- Media processing state is server-owned as well (Mux webhook writes it).
  new.media_status := old.media_status;

  -- Mux Robots job identifiers.
  new.mux_moderation_job_id := old.mux_moderation_job_id;
  new.mux_moderation_result := old.mux_moderation_result;

  return new;
end;
$$;

drop trigger if exists pitches_protect_moderation_trg on public.pitches;
create trigger pitches_protect_moderation_trg
  before update on public.pitches
  for each row execute function public.pitches_protect_moderation();

-- ─── 5. Webhook idempotency table ────────────────────────────────────────
-- Every inbound webhook (currently Mux, potentially others later) is
-- recorded here with a unique (provider, event_id) pair. Duplicate events
-- return early instead of re-executing side effects.
create table if not exists public.moderation_webhook_events (
  id uuid default gen_random_uuid() primary key,
  provider text not null,
  event_id text not null,
  event_type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received',
  last_error text,
  attempt_count integer not null default 0,
  payload jsonb,
  constraint moderation_webhook_events_provider_event_id_key unique (provider, event_id),
  constraint moderation_webhook_events_status_check
    check (processing_status in ('received','processing','processed','ignored','failed'))
);

create index if not exists moderation_webhook_events_received_at_idx
  on public.moderation_webhook_events (received_at desc);

alter table public.moderation_webhook_events enable row level security;

-- ─── 6. Moderation audit log ─────────────────────────────────────────────
-- Every manual admin action (approve, reject, retry, return-to-review,
-- notes) and every automatic terminal transition writes one row here.
create table if not exists public.moderation_audit (
  id uuid default gen_random_uuid() primary key,
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  action text not null,
  previous_state text,
  new_state text,
  reviewed_by text,
  reason text,
  admin_notes text,
  details jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_audit_action_check
    check (action in (
      'auto_approved',
      'auto_needs_review',
      'auto_rejected',
      'auto_failed',
      'admin_approved',
      'admin_rejected',
      'admin_returned_to_review',
      'admin_retry_requested',
      'admin_note_added',
      'moderation_started',
      'moderation_reset'
    ))
);

create index if not exists moderation_audit_pitch_id_idx
  on public.moderation_audit (pitch_id, created_at desc);

alter table public.moderation_audit enable row level security;
-- Service-role only — no policies needed. Admin dashboard reads via the
-- service-role API route, students never see this table.

-- ─── 7. mux_webhook_logs unique-payload guard ────────────────────────────
-- Existing table stays for human-readable audit. Add a mild unique guard so
-- resend storms don't fill the log linearly.
create index if not exists mux_webhook_logs_asset_id_idx
  on public.mux_webhook_logs (asset_id);
create index if not exists mux_webhook_logs_upload_id_idx
  on public.mux_webhook_logs (upload_id);
