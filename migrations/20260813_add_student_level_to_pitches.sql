-- Add student_level to pitches so submitters who select "Current student"
-- can also indicate whether they are Undergraduate, Graduate, or PhD.
-- Nullable because non-student roles (staff, faculty, alumni) don't
-- populate it.

alter table public.pitches
  add column if not exists student_level text;

alter table public.pitches
  drop constraint if exists pitches_student_level_check;

alter table public.pitches
  add constraint pitches_student_level_check
  check (
    student_level is null
    or student_level in ('Undergraduate', 'Graduate', 'PhD')
  );

create index if not exists pitches_student_level_idx
  on public.pitches (student_level);
