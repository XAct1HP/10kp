-- Submitter profile analytics + public pitch feedback (comments with Reddit-style votes).

-- Cached gallery open count (incremented with dedupe via pitch_views).
alter table public.pitches
  add column if not exists view_count integer not null default 0;

create index if not exists pitches_view_count_idx
  on public.pitches (view_count desc);

-- One counted view per pitch per viewer_key (auth user id or anonymous session key).
create table if not exists public.pitch_views (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  viewer_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pitch_id, viewer_key)
);

create index if not exists pitch_views_pitch_id_idx
  on public.pitch_views (pitch_id);

-- Public feedback comments on gallery pitches (umich-authenticated authors).
create table if not exists public.pitch_comments (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_email text not null,
  body text not null,
  score integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pitch_comments_body_len check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists pitch_comments_pitch_created_idx
  on public.pitch_comments (pitch_id, created_at desc);

create index if not exists pitch_comments_user_idx
  on public.pitch_comments (user_id, created_at desc);

-- Reddit-style up/down votes on comments.
create table if not exists public.pitch_comment_votes (
  comment_id uuid not null references public.pitch_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists pitch_comment_votes_user_idx
  on public.pitch_comment_votes (user_id);

-- Keep pitch_comments.score in sync with vote rows.
create or replace function public.refresh_pitch_comment_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.comment_id, old.comment_id);
  update public.pitch_comments c
  set score = coalesce((
    select sum(v.value)::integer from public.pitch_comment_votes v where v.comment_id = target
  ), 0),
  updated_at = now()
  where c.id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists pitch_comment_votes_refresh_score on public.pitch_comment_votes;
create trigger pitch_comment_votes_refresh_score
after insert or update or delete on public.pitch_comment_votes
for each row execute function public.refresh_pitch_comment_score();

-- RLS: service role / admin APIs use service key; enable RLS for safety.
alter table public.pitch_views enable row level security;
alter table public.pitch_comments enable row level security;
alter table public.pitch_comment_votes enable row level security;

-- Comments: anyone (incl. anon via service role in API) can read non-deleted;
-- authenticated users manage their own via user-scoped client if needed.
drop policy if exists "Anyone can read live comments" on public.pitch_comments;
create policy "Anyone can read live comments"
  on public.pitch_comments for select
  to anon, authenticated
  using (is_deleted = false);

drop policy if exists "Users insert own comments" on public.pitch_comments;
create policy "Users insert own comments"
  on public.pitch_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users soft-delete own comments" on public.pitch_comments;
create policy "Users soft-delete own comments"
  on public.pitch_comments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read own comment votes" on public.pitch_comment_votes;
create policy "Users read own comment votes"
  on public.pitch_comment_votes for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users upsert own comment votes" on public.pitch_comment_votes;
create policy "Users upsert own comment votes"
  on public.pitch_comment_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own comment votes" on public.pitch_comment_votes;
create policy "Users update own comment votes"
  on public.pitch_comment_votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own comment votes" on public.pitch_comment_votes;
create policy "Users delete own comment votes"
  on public.pitch_comment_votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- Pitch owners can read view rows for their pitches (optional analytics).
drop policy if exists "Owners read pitch views" on public.pitch_views;
create policy "Owners read pitch views"
  on public.pitch_views for select
  to authenticated
  using (
    exists (
      select 1 from public.pitches p
      where p.id = pitch_id and p.user_id = auth.uid()
    )
  );
