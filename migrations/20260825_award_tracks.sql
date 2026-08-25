-- ============================================================
-- 10KP — Award Tracks
--
-- Splits "tags" (self-declared categories, no award weight) from
-- "award tracks" (what a pitch asks to be judged for).
--
-- Adds:
--   • awards.is_raffle        — marks the auto-entry award (Weekly Raffle).
--                               Never offered on the intake form and never
--                               AI-checked; every submission is in it.
--   • award_criteria          — admin-only matching criteria per award.
--                               Deliberately a SEPARATE table: the awards
--                               table is world-readable, and publishing the
--                               criteria would let submitters write to the
--                               rubric. No select policy here = anon and
--                               authenticated read nothing; the service role
--                               bypasses RLS, so admin routes still see it.
--   • pitch_awards            — the join, plus the AI relevance verdict that
--                               decides whether the pitch stays in the track.
--
-- Safe to re-run.
-- ============================================================

-- ─── 1. Raffle discriminator on awards ──────────────────────
alter table public.awards
  add column if not exists is_raffle boolean not null default false;

comment on column public.awards.is_raffle is
  'Auto-entry award (the Weekly Raffle). Hidden from the intake award picker and skipped by the AI relevance check.';

-- At most one raffle award at a time — the intake copy and the eligibility
-- engine both assume a single auto-entry track.
create unique index if not exists awards_single_raffle_idx
  on public.awards (is_raffle)
  where is_raffle;

-- ─── 2. Admin-only match criteria ───────────────────────────
create table if not exists public.award_criteria (
  award_id uuid primary key references public.awards(id) on delete cascade,
  criteria text,
  updated_at timestamptz not null default now()
);

alter table public.award_criteria enable row level security;

-- No policies on purpose. RLS with zero policies denies every role except
-- the service role, which bypasses RLS entirely. Do not add a select policy.
drop policy if exists "Anyone can read award_criteria" on public.award_criteria;

-- ─── 3. Pitch ↔ Award track join ────────────────────────────
create table if not exists public.pitch_awards (
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  award_id uuid not null references public.awards(id) on delete cascade,

  -- pending  — selected at submission, not yet checked (pitch is still in
  --            moderation, or moderation approved it and the check is queued)
  -- eligible — in the track: AI confirmed the fit, the check could not run,
  --            or an admin put it back
  -- removed  — AI found no meaningful fit, or an admin took it out
  status text not null default 'pending',

  -- match | no_match | unverified (provider failure — never auto-removes)
  match_decision text,
  match_confidence numeric,
  match_reason text,
  checked_at timestamptz,

  -- Set when a human overrides the AI. The eligibility engine never
  -- re-decides a row that carries an override.
  overridden_by text,
  overridden_at timestamptz,

  created_at timestamptz not null default now(),
  primary key (pitch_id, award_id)
);

alter table public.pitch_awards
  drop constraint if exists pitch_awards_status_check;
alter table public.pitch_awards
  add constraint pitch_awards_status_check
  check (status in ('pending', 'eligible', 'removed'));

alter table public.pitch_awards
  drop constraint if exists pitch_awards_decision_check;
alter table public.pitch_awards
  add constraint pitch_awards_decision_check
  check (match_decision is null or match_decision in ('match', 'no_match', 'unverified'));

create index if not exists pitch_awards_award_idx on public.pitch_awards (award_id, status);
create index if not exists pitch_awards_pitch_idx on public.pitch_awards (pitch_id);
create index if not exists pitch_awards_pending_idx on public.pitch_awards (status) where status = 'pending';

alter table public.pitch_awards enable row level security;

-- Submitters attach award tracks to their own pitch at intake, mirroring the
-- pitch_tags policies.
drop policy if exists "Users can insert own pitch awards" on public.pitch_awards;
create policy "Users can insert own pitch awards"
  on public.pitch_awards for insert
  to authenticated
  with check (
    exists (
      select 1 from public.pitches
      where pitches.id = pitch_id
        and pitches.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own pitch awards" on public.pitch_awards;
create policy "Users can read own pitch awards"
  on public.pitch_awards for select
  to authenticated
  using (
    exists (
      select 1 from public.pitches
      where pitches.id = pitch_id
        and pitches.user_id = auth.uid()
    )
  );

-- Verdicts and status are written by the eligibility engine and by admins,
-- both through the service role. No update/delete policy for submitters —
-- a student must not be able to put their own pitch back in a track.

-- ─── 4. Audit actions for award-track overrides ─────────────
-- moderation_audit constrains `action` to a fixed list. Admin overrides of an
-- award track write there too, so widen it — otherwise those rows are
-- rejected and the override happens with no history behind it.
alter table public.moderation_audit
  drop constraint if exists moderation_audit_action_check;
alter table public.moderation_audit
  add constraint moderation_audit_action_check
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
    'moderation_reset',
    'admin_award_included',
    'admin_award_excluded',
    'admin_award_recheck'
  ));
