-- ============================================================
-- 10KP — Event announcements (Phase 3 of announcements overhaul)
--
-- Events are one-off announcements (pitch workshops, info sessions, etc.),
-- so their data lives directly on the announcements row rather than in a
-- separate events table. Sponsors attach via a per-announcement join.
--
-- Adds:
--   • event_* columns on announcements
--   • announcement_sponsors join (currently used by event announcements;
--     award-type announcements continue to draw sponsors from their
--     linked award's award_sponsors)
-- ============================================================

alter table public.announcements
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz,
  add column if not exists event_location_name text,
  add column if not exists event_address text,
  add column if not exists event_registration_url text;

create index if not exists announcements_event_starts_at_idx
  on public.announcements (event_starts_at)
  where announcement_type = 'event';

create table if not exists public.announcement_sponsors (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (announcement_id, sponsor_id)
);

create index if not exists announcement_sponsors_announcement_idx
  on public.announcement_sponsors (announcement_id);
create index if not exists announcement_sponsors_sponsor_idx
  on public.announcement_sponsors (sponsor_id);

alter table public.announcement_sponsors enable row level security;

drop policy if exists "Anyone can read announcement_sponsors" on public.announcement_sponsors;
create policy "Anyone can read announcement_sponsors"
  on public.announcement_sponsors for select
  to anon, authenticated
  using (true);
