-- ============================================================
-- 10KP — Vote integrity v2
--
-- Written after twelve votes cast from mziaulh+mark@, mziaulh+omair@,
-- mziaulh+braden@ … onto their own submitter's pitch inside eight
-- minutes, and nothing appeared in the Integrity queue.
--
-- The scoring was not at fault — replayed against lib/voteIntegrity.js
-- that cluster scores 100/high. The failure was that nothing ran, and
-- nothing anywhere recorded that nothing ran. So this migration is
-- mostly about closing that gap, plus the three changes agreed after:
--
--   1. voter_inbox   — the canonical mailbox behind an address, so
--                      sub-address aliases share one vote budget.
--   2. ip_address /  — the raw client address and user-agent, admin-only
--      user_agent      and purgeable, alongside the existing salted
--                      hashes. This reverses part of the v1 privacy
--                      stance; see the note under section 2.
--   3. voided_at …   — soft-void, so a removed vote stops counting but
--                      stays legible in the audit trail.
--   4. vote_sweeps   — a run log for the detector. The whole reason the
--                      first incident was invisible.
--
-- Safe to run more than once.
-- ============================================================

-- ─── 1. voter_inbox: the mailbox behind the address ─────────
-- j.smith+vote3@gmail.com and jsmith@gmail.com are one inbox. That is a
-- fact about how mail delivery works, not an inference, so it is the one
-- place the ballot is allowed to treat two addresses as one person.
--
-- Deliberately NARROWER than the scoring stem in lib/voteIntegrity.js:
-- trailing digits are NOT stripped here. mark1@ and mark2@ may well be
-- two real people, and the vote limit must never be enforced on a guess.
-- Keep this function in lockstep with canonicalInbox() in
-- lib/voteIntegrity.js.
create or replace function public.vote_canonical_inbox(email text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
  at_pos     int;
  local_part text;
  domain     text;
begin
  normalized := lower(btrim(coalesce(email, '')));
  at_pos := length(normalized) - position('@' in reverse(normalized)) + 1;
  -- Anything without a usable local@domain shape returns NULL, matching
  -- canonicalInbox() exactly. The two implementations were diffed over a
  -- battery of addresses and this branch was the only place they had
  -- disagreed; callers already fall back to the raw address.
  if at_pos <= 1 or at_pos >= length(normalized) then
    return null;
  end if;

  local_part := substring(normalized from 1 for at_pos - 1);
  domain     := substring(normalized from at_pos + 1);

  -- Everything after "+" is a label the user chose; it never affects
  -- which mailbox the message lands in.
  local_part := split_part(local_part, '+', 1);

  -- Dots are cosmetic on Google-hosted consumer mail, and googlemail.com
  -- is an alias of gmail.com. Not true of most other providers, so this
  -- stays a two-domain special case rather than a general rule.
  if domain in ('gmail.com', 'googlemail.com') then
    local_part := replace(local_part, '.', '');
    domain := 'gmail.com';
  end if;

  if local_part = '' then
    return nullif(normalized, '');
  end if;

  return local_part || '@' || domain;
end;
$$;

alter table public.pitch_votes
  add column if not exists voter_inbox text;

update public.pitch_votes
   set voter_inbox = public.vote_canonical_inbox(coalesce(voter_key, voter_email))
 where voter_inbox is null;

create index if not exists pitch_votes_voter_inbox_idx
  on public.pitch_votes (voter_inbox)
  where voter_inbox is not null;

-- ─── 2. Raw request data, admin-only and purgeable ──────────
-- v1 stored salted digests only and said so loudly. That held up for
-- "were these two votes cast from the same place?" and fell over on the
-- question actually asked during an incident: "is this a dorm room or is
-- it campus wifi?" — which a hash cannot answer.
--
-- So the raw address and user-agent are now kept, with three limits:
-- the columns are reachable only through service-role admin routes (RLS
-- on pitch_votes is unchanged and no policy exposes them), the hashes
-- stay as the thing the detector actually groups on, and the values are
-- meant to be purged once the competition is decided — see
-- public.purge_vote_pii below.
alter table public.pitch_votes
  add column if not exists ip_address text,
  add column if not exists user_agent text;

comment on column public.pitch_votes.ip_address is
  'Raw client IP. Admin-only, for incident review. Purge with public.purge_vote_pii() once results are final.';
comment on column public.pitch_votes.user_agent is
  'Raw user-agent. Admin-only, for incident review. Purge with public.purge_vote_pii() once results are final.';

-- Nulls out raw PII older than the retention window, leaving the salted
-- hashes (and therefore the detector) intact. Run it on a schedule, or
-- by hand the day the winners are announced:
--     select public.purge_vote_pii(30);
create or replace function public.purge_vote_pii(retain_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.pitch_votes
     set ip_address = null,
         user_agent = null
   where created_at < now() - make_interval(days => greatest(retain_days, 0))
     and (ip_address is not null or user_agent is not null);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- `anon` and `authenticated` are Supabase's roles; guarded so this file
-- also applies cleanly against a plain Postgres (a local test database,
-- say) where they don't exist.
do $$
begin
  revoke all on function public.purge_vote_pii(integer) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.purge_vote_pii(integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.purge_vote_pii(integer) from authenticated;
  end if;
end;
$$;

-- ─── 3. Soft-void ───────────────────────────────────────────
-- A voided vote stops counting everywhere but stays in the audit trail,
-- struck through, next to who voided it and why. Hard deletes made the
-- evidence disappear along with the vote, which is the wrong trade when
-- the whole point is being able to show your work afterwards.
alter table public.pitch_votes
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   text,
  add column if not exists void_reason text;

-- One mailbox, one vote per pitch. Attempted rather than asserted: if
-- alias votes are already sitting in the table this index cannot be
-- built, and failing the whole migration over historical data would be
-- unhelpful. The notice tells you what to clean up first.
do $$
begin
  begin
    create unique index if not exists pitch_votes_pitch_inbox_key
      on public.pitch_votes (pitch_id, voter_inbox)
      where voter_inbox is not null and voided_at is null;
  exception when unique_violation or duplicate_table then
    raise notice
      'pitch_votes_pitch_inbox_key not created — existing alias votes collide. Review them with:  select pitch_id, voter_inbox, count(*), array_agg(voter_email) from public.pitch_votes where voided_at is null group by 1,2 having count(*) > 1;  void the duplicates in the admin Votes tab, then re-run this migration.';
  end;
end;
$$;

-- Every tally query filters `voided_at is null`, so this index is the
-- hot path for the gallery and analytics.
create index if not exists pitch_votes_live_idx
  on public.pitch_votes (pitch_id)
  where voided_at is null;

-- ─── 4. vote_sweeps: proof the detector ran ─────────────────
-- The incident that prompted all of this was invisible for one reason:
-- the Integrity tab shows the same "Nothing flagged" whether the sweep
-- found nothing, was never scheduled, or 401'd on a missing secret.
-- An empty queue is only reassuring if you can see when it was last
-- filled, so every run — scheduled, manual or triggered by a vote —
-- writes a row here, failures included.
create table if not exists public.vote_sweeps (
  id              uuid primary key default gen_random_uuid(),
  ran_at          timestamptz not null default now(),
  source          text    not null default 'cron',   -- cron | manual | realtime
  ok              boolean not null default true,
  error           text,
  votes_analyzed  integer not null default 0,
  distinct_voters integer not null default 0,
  clusters_found  integer not null default 0,
  high            integer not null default 0,
  medium          integer not null default 0,
  low             integer not null default 0,
  upserted        integer not null default 0,
  auto_resolved   integer not null default 0,
  duration_ms     integer
);

create index if not exists vote_sweeps_ran_at_idx
  on public.vote_sweeps (ran_at desc);

alter table public.vote_sweeps enable row level security;
-- Admin-only, same as vote_flags: RLS on with no policies denies anon
-- and authenticated outright; service-role routes bypass it.

-- ─── 5. vote_flags: how a flag was found ────────────────────
-- Realtime flags are written by the vote route within seconds of the
-- vote; sweep flags come from the hourly pass. Worth telling apart when
-- you are trying to work out whether the fast path is doing its job.
alter table public.vote_flags
  add column if not exists detected_by text not null default 'sweep';
