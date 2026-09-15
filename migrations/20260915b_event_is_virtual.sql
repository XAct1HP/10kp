-- ============================================================
-- 10KP: Virtual events without a join link yet
--
-- 20260915_virtual_events.sql treated an event as virtual exactly when it
-- had a meeting link. The link is now optional (logistics may not be sorted
-- when the event is posted), so "virtual" needs its own flag.
-- Safe to run whether or not the earlier migration has been applied.
-- ============================================================

alter table public.announcements
  add column if not exists event_virtual_url text;

alter table public.announcements
  add column if not exists event_is_virtual boolean not null default false;

-- Anything that already has a meeting link is virtual.
update public.announcements
   set event_is_virtual = true
 where event_virtual_url is not null
   and event_is_virtual = false;
