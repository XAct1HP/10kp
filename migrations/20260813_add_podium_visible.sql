-- Admin-controlled toggle for the Top 3 podium on the public gallery.
-- Default true so the podium stays visible on existing installs until
-- an admin flips it off through the Pitches tab.

alter table public.competition_settings
  add column if not exists podium_visible boolean not null default true;
