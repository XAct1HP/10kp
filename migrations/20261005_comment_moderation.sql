-- Pitch feedback goes private + gets moderated.
--
-- Two changes to the feature shipped in 20260928_submitter_profile_comments.sql:
--
--   1. Feedback is no longer public. A comment is visible to the pitch's owner
--      (on their profile page) and to admins. Nobody else, including other
--      signed-in students browsing the gallery, can read it.
--   2. A comment is moderated between submission and delivery. It is inserted
--      as 'pending', classified, and only an 'approved' row is ever shown to
--      the owner. A 'blocked' row stays visible to admins forever — it is
--      never deleted, so the admin thread is a complete record of what was
--      said about a pitch.
--
-- Safe to run before or after the 20260928 migration, and safe to re-run.

alter table public.pitch_comments
  add column if not exists moderation_status text not null default 'pending',
  add column if not exists moderation_summary text,
  add column if not exists moderation_categories jsonb not null default '[]'::jsonb,
  add column if not exists moderation_provider text,
  add column if not exists moderation_checked_at timestamptz,
  add column if not exists moderation_reviewed_by text,
  add column if not exists moderation_reviewed_at timestamptz;

-- pending  — submitted, not yet classified, or held because the classifier was
--            unsure or unavailable. Admin-visible, not owner-visible.
-- approved — delivered to the pitch owner.
-- blocked  — withheld from the owner, kept for the admin record.
do $$
begin
  alter table public.pitch_comments
    add constraint pitch_comments_moderation_status_check
    check (moderation_status in ('pending', 'approved', 'blocked'));
exception
  when duplicate_object then null;
end $$;

-- The owner's profile page reads (pitch_id, moderation_status) constantly;
-- the admin thread reads every status for one pitch, newest first.
create index if not exists pitch_comments_pitch_status_created_idx
  on public.pitch_comments (pitch_id, moderation_status, created_at desc);

-- Anything that predates this migration was written under the old public
-- model and was already visible, so approving it preserves what people saw.
-- New rows take the 'pending' default and go through the classifier.
update public.pitch_comments
set moderation_status = 'approved',
    moderation_summary = 'Approved automatically: predates comment moderation.',
    moderation_provider = 'backfill',
    moderation_checked_at = now()
where moderation_checked_at is null
  and moderation_status = 'pending'
  and created_at < now();

-- ─── RLS ───────────────────────────────────────────────────────────────
-- The API routes all go through the service role, which bypasses RLS, so
-- these policies are defense in depth: if a client ever queries the table
-- with an anon or user key, it must not be able to read a comment that
-- isn't its own or on its own pitch.

alter table public.pitch_comments enable row level security;

-- This is the policy that made feedback public. It has to go.
drop policy if exists "Anyone can read live comments" on public.pitch_comments;

drop policy if exists "Authors read own comments" on public.pitch_comments;
create policy "Authors read own comments"
  on public.pitch_comments for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Owners read approved comments on own pitches" on public.pitch_comments;
create policy "Owners read approved comments on own pitches"
  on public.pitch_comments for select
  to authenticated
  using (
    moderation_status = 'approved'
    and is_deleted = false
    and exists (
      select 1 from public.pitches p
      where p.id = pitch_id and p.user_id = auth.uid()
    )
  );

-- Inserts still come from the author, but a client-side insert must not be
-- able to pick its own moderation verdict.
drop policy if exists "Users insert own comments" on public.pitch_comments;
create policy "Users insert own comments"
  on public.pitch_comments for insert
  to authenticated
  with check (auth.uid() = user_id and moderation_status = 'pending');

-- Public comment voting is gone along with public visibility: there is
-- nothing for a non-owner to vote on. The table and its score trigger are
-- left in place rather than dropped, so no data is lost if voting ever
-- comes back in an owner-facing form.
drop policy if exists "Users upsert own comment votes" on public.pitch_comment_votes;
drop policy if exists "Users update own comment votes" on public.pitch_comment_votes;
drop policy if exists "Users delete own comment votes" on public.pitch_comment_votes;
