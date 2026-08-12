-- ============================================================
-- 10KP — Sponsors & Awards (Phase 1 of announcements overhaul)
--
-- Adds:
--   • sponsors table          — sponsoring departments/orgs
--   • awards table            — award definitions (Weekly Raffle, etc.)
--   • award_sponsors join     — an award may have many sponsors
--   • sponsor-logos bucket    — public storage for sponsor logos
--   • announcement_type col   — general | award | event
--
-- Phase 2 will add announcement_awards / announcement_winners.
-- Phase 3 will add events + event_sponsors.
-- ============================================================

-- ─── 1. Sponsors ────────────────────────────────────────────
create table if not exists public.sponsors (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  website text,
  logo_path text,                     -- object path in sponsor-logos bucket
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sponsors_name_key on public.sponsors (lower(name));
create index if not exists sponsors_sort_order_idx on public.sponsors (sort_order, name);

alter table public.sponsors enable row level security;

-- Anyone (even anon) can read sponsors — logos + names appear on public
-- Rules / announcement pages.
drop policy if exists "Anyone can read sponsors" on public.sponsors;
create policy "Anyone can read sponsors"
  on public.sponsors for select
  to anon, authenticated
  using (true);
-- All writes go through admin API routes with service-role key.

-- ─── 2. Awards ──────────────────────────────────────────────
create table if not exists public.awards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  prize text,                         -- freeform prize description (e.g. "$500 + coaching")
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists awards_name_key on public.awards (lower(name));
create index if not exists awards_sort_order_idx on public.awards (sort_order, name);

alter table public.awards enable row level security;

drop policy if exists "Anyone can read awards" on public.awards;
create policy "Anyone can read awards"
  on public.awards for select
  to anon, authenticated
  using (true);

-- ─── 3. Award ↔ Sponsor join ────────────────────────────────
create table if not exists public.award_sponsors (
  award_id uuid not null references public.awards(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (award_id, sponsor_id)
);

create index if not exists award_sponsors_award_idx on public.award_sponsors (award_id);
create index if not exists award_sponsors_sponsor_idx on public.award_sponsors (sponsor_id);

alter table public.award_sponsors enable row level security;

drop policy if exists "Anyone can read award_sponsors" on public.award_sponsors;
create policy "Anyone can read award_sponsors"
  on public.award_sponsors for select
  to anon, authenticated
  using (true);

-- ─── 4. Announcement type discriminator ─────────────────────
-- Existing announcements table gets a type column so Phase 2/3 can key
-- award and event announcements off the same table without a rewrite.
alter table public.announcements
  add column if not exists announcement_type text not null default 'general';

alter table public.announcements
  drop constraint if exists announcements_type_check;
alter table public.announcements
  add constraint announcements_type_check
  check (announcement_type in ('general', 'award', 'event'));

create index if not exists announcements_type_idx
  on public.announcements (announcement_type);

-- ─── 5. Sponsor logo storage bucket ─────────────────────────
insert into storage.buckets (id, name, public)
values ('sponsor-logos', 'sponsor-logos', true)
on conflict (id) do nothing;

-- Public read of sponsor logos
drop policy if exists "Public read of sponsor logos" on storage.objects;
create policy "Public read of sponsor logos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'sponsor-logos');

-- Writes/deletes to sponsor-logos go through admin API using service role,
-- which bypasses RLS — no additional storage policy needed here.
