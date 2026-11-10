-- Master on/off for the public Hall of Fame page + nav link.
--
-- Default false so existing installs stay admin-only until an organizer
-- flips the switch from Admin → Hall of Fame. Matches the prior hardcoded
-- private gate on /hall-of-fame and /api/hall-of-fame.

alter table public.competition_settings
  add column if not exists hall_of_fame_public boolean not null default false;
