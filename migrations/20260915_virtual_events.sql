-- ============================================================
-- 10KP: Virtual events + optional location
--
-- Event announcements used to require an address (for the map). Location is
-- now optional, and an event can be virtual instead: the meeting link lives
-- in event_virtual_url and renders as a Join button on the bulletin card.
-- An event is virtual exactly when event_virtual_url is set.
-- ============================================================

alter table public.announcements
  add column if not exists event_virtual_url text;
