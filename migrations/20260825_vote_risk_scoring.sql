-- Vote risk scoring for suspicious-voting review in Admin → Votes.
-- Adds deterministic risk fields on pitch_votes (mirrors pitch moderation status pattern).

alter table public.pitch_votes
  add column if not exists vote_risk_score integer not null default 0,
  add column if not exists vote_risk_reasons jsonb not null default '[]'::jsonb,
  add column if not exists vote_risk_status text not null default 'clear',
  add column if not exists vote_risk_scored_at timestamptz;

-- Backfill status for any nulls from partial applies.
update public.pitch_votes
set vote_risk_status = 'clear'
where vote_risk_status is null;

alter table public.pitch_votes
  drop constraint if exists pitch_votes_vote_risk_status_check;

alter table public.pitch_votes
  add constraint pitch_votes_vote_risk_status_check
  check (vote_risk_status in ('clear', 'review', 'dismissed'));

create index if not exists pitch_votes_risk_status_score_idx
  on public.pitch_votes (vote_risk_status, vote_risk_score desc, created_at desc);

create index if not exists pitch_votes_pitch_created_idx
  on public.pitch_votes (pitch_id, created_at desc);

create index if not exists pitch_votes_voter_key_idx
  on public.pitch_votes (voter_key);
