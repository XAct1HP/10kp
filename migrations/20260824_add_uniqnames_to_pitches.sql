-- Capture U-M uniqnames on submissions.
--
-- `uniqname` is the submitter's own uniqname (the part of their @umich.edu
-- address before the @). It is collected on Floor 1 of the intake form and
-- prefilled from the account they signed in with.
--
-- `teammate_uniqnames` holds the uniqnames of any teammates the submitter
-- adds via the "Add Teammate" control. Stored as a text[] rather than a join
-- table because teammates are free-text identifiers, not accounts — a
-- teammate may never sign up at all.

alter table public.pitches
  add column if not exists uniqname text,
  add column if not exists teammate_uniqnames text[] not null default '{}';

-- Uniqnames are lowercase alphanumeric, 3-8 chars in practice. Kept loose
-- (2-32, letters/digits/hyphen) so an unusual account never blocks a
-- submission, but strict enough to reject a pasted full email address.
alter table public.pitches
  drop constraint if exists pitches_uniqname_check;
alter table public.pitches
  add constraint pitches_uniqname_check
  check (uniqname is null or uniqname ~ '^[a-z0-9-]{2,32}$');

create index if not exists pitches_uniqname_idx
  on public.pitches (uniqname);

-- Backfill from the auth account's email where it is unambiguous. Safe to
-- re-run; only fills rows that are still null.
update public.pitches p
set uniqname = lower(split_part(u.email, '@', 1))
from auth.users u
where p.user_id = u.id
  and p.uniqname is null
  and u.email ilike '%@umich.edu'
  and lower(split_part(u.email, '@', 1)) ~ '^[a-z0-9-]{2,32}$';
