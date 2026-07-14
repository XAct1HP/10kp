-- Content moderation columns for pitch submissions
-- Every new pitch starts in 'pending' and is either auto-approved, auto-rejected,
-- or flagged for manual admin review by the UM-GPT moderation pipeline.

alter table public.pitches
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists moderation_reason text,
  add column if not exists moderation_flags jsonb not null default '[]'::jsonb,
  add column if not exists moderation_transcript text,
  add column if not exists moderation_reviewed_by text,
  add column if not exists moderation_reviewed_at timestamptz,
  add column if not exists moderation_priority integer not null default 0,
  add column if not exists moderation_checked_at timestamptz;

-- Legal states: pending | approved | rejected | flagged | errored
alter table public.pitches
  drop constraint if exists pitches_moderation_status_check;
alter table public.pitches
  add constraint pitches_moderation_status_check
  check (moderation_status in ('pending','approved','rejected','flagged','errored'));

-- Admin dashboard ordering: flagged first, then pending, then everything else,
-- newest within each bucket.
create index if not exists pitches_moderation_status_idx
  on public.pitches (moderation_status);

create index if not exists pitches_moderation_priority_idx
  on public.pitches (moderation_priority desc, created_at desc);

-- Backfill: any pitches that existed before moderation was introduced should be
-- treated as approved so they remain visible in the gallery.
update public.pitches
  set moderation_status = 'approved'
  where moderation_status = 'pending'
    and created_at < now() - interval '1 minute';

-- ─── Guard: only service_role may change moderation_* columns ────────
-- The client-side "Users can update own pitches" RLS policy allows regular
-- users to UPDATE any column on their own rows. Without this trigger a user
-- could set moderation_status='approved' from the browser and bypass review.
-- We revert any change to moderation_* fields made by anyone other than
-- service_role (which is used by API routes and the webhook).

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

  new.moderation_status := old.moderation_status;
  new.moderation_reason := old.moderation_reason;
  new.moderation_flags := old.moderation_flags;
  new.moderation_transcript := old.moderation_transcript;
  new.moderation_reviewed_by := old.moderation_reviewed_by;
  new.moderation_reviewed_at := old.moderation_reviewed_at;
  new.moderation_priority := old.moderation_priority;
  new.moderation_checked_at := old.moderation_checked_at;
  return new;
end;
$$;

drop trigger if exists pitches_protect_moderation_trg on public.pitches;
create trigger pitches_protect_moderation_trg
  before update on public.pitches
  for each row execute function public.pitches_protect_moderation();
