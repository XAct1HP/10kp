-- ============================================================
-- 10KP — Submission deadline
--
-- Adds a second date to competition_settings so the home page can run a
-- two-phase countdown:
--   Phase 1: pre-start   -> counting down to competition_date
--   Phase 2: pre-close   -> counting down to submission_deadline
--   Phase 3: closed      -> submissions closed message
-- ============================================================

alter table public.competition_settings
  add column if not exists submission_deadline timestamptz;
