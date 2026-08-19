-- Winner metadata for seed pitches — the competition year a past winner
-- placed in, and which award category they won.
--
-- Why this exists: the gallery's "Last Year Winners" lane used to derive the
-- year from created_at and ordering from vote_count. Both break once voting
-- is closed on seed pitches. Admins now set year + award category explicitly
-- from the Pitches tab.
--
-- Both columns are nullable so pre-existing seed rows keep working: the
-- gallery falls back to year(created_at) when winner_year is null.

alter table public.pitches
  add column if not exists winner_year integer,
  add column if not exists winner_award_id uuid references public.awards(id) on delete set null;

alter table public.pitches
  drop constraint if exists pitches_winner_year_check;
alter table public.pitches
  add constraint pitches_winner_year_check
  check (winner_year is null or (winner_year >= 1900 and winner_year <= 2200));

create index if not exists pitches_winner_year_award_idx
  on public.pitches (winner_year, winner_award_id)
  where is_seed = true;
