-- ============================================================
-- 10KP — Award announcements (Phase 2 of announcements overhaul)
--
-- Adds:
--   • announcements.award_id      — nullable link to awards
--   • announcement_winners join   — winning pitches per announcement
--
-- Each "record winners" action creates a FRESH announcement, so there is
-- no per-award "current cycle" state to track — every announcement is
-- self-contained and lists only the winners the admin picked for that
-- announcement.
-- ============================================================

alter table public.announcements
  add column if not exists award_id uuid references public.awards(id) on delete set null;

create index if not exists announcements_award_id_idx
  on public.announcements (award_id)
  where award_id is not null;

create table if not exists public.announcement_winners (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (announcement_id, pitch_id)
);

create index if not exists announcement_winners_announcement_idx
  on public.announcement_winners (announcement_id);
create index if not exists announcement_winners_pitch_idx
  on public.announcement_winners (pitch_id);

alter table public.announcement_winners enable row level security;

-- Public reads: allow anyone to read winners (they show on the public
-- Announcements page). Writes go through admin API using service role.
drop policy if exists "Anyone can read announcement_winners" on public.announcement_winners;
create policy "Anyone can read announcement_winners"
  on public.announcement_winners for select
  to anon, authenticated
  using (true);
