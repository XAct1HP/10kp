-- If an earlier draft of 20260818 added winner_rank, swap it for an award
-- category FK. Safe to re-run: every statement is idempotent.

alter table public.pitches
  add column if not exists winner_award_id uuid references public.awards(id) on delete set null;

alter table public.pitches
  drop constraint if exists pitches_winner_rank_check;

alter table public.pitches
  drop column if exists winner_rank;

drop index if exists pitches_winner_year_rank_idx;

create index if not exists pitches_winner_year_award_idx
  on public.pitches (winner_year, winner_award_id)
  where is_seed = true;
