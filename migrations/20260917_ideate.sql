-- ============================================================
-- 10KP: Ideate workspace
--
-- /ideate walks a logged-in student through a six-step idea curriculum
-- with UMGPT as a coach. Two tables:
--
--   • ideate_sessions   — one saved workspace per account (jsonb blob of
--                         everything the student has written, plus the
--                         step they were on).
--   • ideate_ai_usage   — coach calls per account per day, so UMGPT cost
--                         is capped per student.
--
-- Both are service-role only: RLS on with no policies, every read/write goes
-- through /api/ideate/*, which verifies the caller's session first. That also
-- keeps the usage counter out of students' reach.
-- ============================================================

-- ─── 1. Saved workspaces ────────────────────────────────────
create table if not exists public.ideate_sessions (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  current_step smallint not null default 0,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.ideate_sessions enable row level security;
-- No policies on purpose — see header.

create or replace function public.touch_ideate_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ideate_sessions_touch_updated_at on public.ideate_sessions;
create trigger ideate_sessions_touch_updated_at
  before update on public.ideate_sessions
  for each row execute function public.touch_ideate_sessions_updated_at();

-- ─── 2. Coach usage counter ─────────────────────────────────
-- The day is the Ann Arbor calendar day, so the cap resets at local midnight.
create table if not exists public.ideate_ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  calls   integer not null default 0 check (calls >= 0),
  primary key (user_id, day)
);

alter table public.ideate_ai_usage enable row level security;
-- No policies on purpose — see header.

-- Atomically claim one coach call. Returns the new count for today, or NULL
-- when the student is already at p_limit (nothing is written in that case).
-- A single insert ... on conflict statement, so two tabs firing at once can
-- never both slip past the cap.
create or replace function public.ideate_claim_ai_call(p_user_id uuid, p_limit integer)
returns integer
language sql
as $$
  insert into public.ideate_ai_usage as u (user_id, day, calls)
  select p_user_id, (now() at time zone 'America/New_York')::date, 1
  where p_limit > 0
  on conflict (user_id, day) do update
    set calls = u.calls + 1
    where u.calls < p_limit
  returning u.calls;
$$;

-- Give a call back when UMGPT failed, so an outage doesn't eat the allowance.
create or replace function public.ideate_refund_ai_call(p_user_id uuid)
returns void
language sql
as $$
  update public.ideate_ai_usage
     set calls = greatest(calls - 1, 0)
   where user_id = p_user_id
     and day = (now() at time zone 'America/New_York')::date;
$$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default. These are only for the service role. (Guarded so the migration
-- also applies on a plain Postgres without Supabase's roles.)
do $$
begin
  revoke execute on function public.ideate_claim_ai_call(uuid, integer) from public;
  revoke execute on function public.ideate_refund_ai_call(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.ideate_claim_ai_call(uuid, integer) from anon;
    revoke execute on function public.ideate_refund_ai_call(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.ideate_claim_ai_call(uuid, integer) from authenticated;
    revoke execute on function public.ideate_refund_ai_call(uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ideate_claim_ai_call(uuid, integer) to service_role;
    grant execute on function public.ideate_refund_ai_call(uuid) to service_role;
  end if;
end;
$$;
