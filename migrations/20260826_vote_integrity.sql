-- ============================================================
-- 10KP — Vote integrity
--
-- The gallery ballot is deliberately open: anyone, anywhere, can vote
-- with a self-declared name + email (see app/api/gallery/votes/route.js).
-- That is a product decision, not an oversight — so instead of closing
-- the ballot we capture a coarse request fingerprint on every vote and
-- run a scheduled detector over it.
--
-- Adds:
--   • fingerprint columns on pitch_votes — all HASHED, never raw
--   • vote_flags table — clusters of voter identities that look like
--     one person, written by /api/cron/vote-integrity and triaged by
--     a human in the admin Votes tab.
--
-- Privacy note: we store salted SHA-256 digests, not IP addresses. The
-- digests are useful for equality comparison ("were these two votes cast
-- from the same place?") and nothing else — they cannot be reversed into
-- an address, and rotating VOTE_FINGERPRINT_SALT invalidates all of them.
-- Coarse geo (country/region/city) comes from Vercel's edge headers and
-- is stored in the clear because it is not identifying on its own.
-- ============================================================

-- ─── 1. Fingerprint columns on pitch_votes ──────────────────
alter table public.pitch_votes
  add column if not exists ip_hash         text,
  add column if not exists ip_prefix_hash  text,
  add column if not exists user_agent_hash text,
  add column if not exists geo_country     text,
  add column if not exists geo_region      text,
  add column if not exists geo_city        text;

-- The detector groups by exact IP and by subnet+browser, and always
-- scans a trailing time window.
create index if not exists pitch_votes_ip_hash_idx
  on public.pitch_votes (ip_hash)
  where ip_hash is not null;

create index if not exists pitch_votes_ip_prefix_hash_idx
  on public.pitch_votes (ip_prefix_hash)
  where ip_prefix_hash is not null;

create index if not exists pitch_votes_created_at_idx
  on public.pitch_votes (created_at desc);

-- ─── 2. vote_flags ──────────────────────────────────────────
-- One row per *cluster*: a set of distinct voter identities that share
-- an anchor (an email stem, an IP, a subnet+user-agent, a display name)
-- and therefore may be one person voting more than once.
--
-- cluster_key is `<type>:<anchor>` and is intentionally stable as a
-- cluster grows, so re-running the detector updates a row in place
-- rather than piling up duplicates of the same ring.
create table if not exists public.vote_flags (
  id            uuid primary key default gen_random_uuid(),
  cluster_key   text not null,
  cluster_type  text not null,             -- stem | ip | subnet_ua | name
  anchor_label  text,                      -- human-readable anchor, redacted where needed
  pitch_id      uuid references public.pitches (id) on delete cascade,
  score         integer not null default 0,   -- 0..100
  severity      text    not null default 'low', -- low | medium | high
  signals       jsonb   not null default '[]'::jsonb,
  voter_keys    text[]  not null default '{}',
  vote_ids      uuid[]  not null default '{}',
  voter_count   integer not null default 0,
  vote_count    integer not null default 0,
  evidence      jsonb   not null default '{}'::jsonb,
  status        text    not null default 'open',  -- open | dismissed | confirmed | actioned | resolved
  review_note   text,
  reviewed_by   text,
  reviewed_at   timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists vote_flags_cluster_key_idx
  on public.vote_flags (cluster_key);

create index if not exists vote_flags_triage_idx
  on public.vote_flags (status, score desc, last_seen_at desc);

create index if not exists vote_flags_pitch_idx
  on public.vote_flags (pitch_id)
  where pitch_id is not null;

alter table public.vote_flags enable row level security;
-- No policies: this table is admin-only and every read/write goes through
-- a service-role API route. RLS on with zero policies denies anon and
-- authenticated outright, which is exactly what we want.

-- Keep updated_at honest.
create or replace function public.touch_vote_flags_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vote_flags_touch_updated_at on public.vote_flags;
create trigger vote_flags_touch_updated_at
  before update on public.vote_flags
  for each row execute function public.touch_vote_flags_updated_at();
