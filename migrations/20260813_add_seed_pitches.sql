-- Seed pitches — past-year winner videos uploaded by admins to prime the
-- gallery. Rows with is_seed = true:
--   • Are inserted directly with moderation_status/state = 'approved'
--     (they bypass the moderation pipeline entirely — see the webhook
--     handler at app/api/webhooks/mux/route.js).
--   • Are visible in the public gallery when the global toggle
--     competition_settings.seeds_visible is true.
--   • Render with a "past winner" marker in the gallery UI.

-- 1. Flag column on pitches
alter table public.pitches
  add column if not exists is_seed boolean not null default false;

create index if not exists pitches_is_seed_idx
  on public.pitches (is_seed)
  where is_seed = true;

-- 2. Global toggle for gallery visibility
alter table public.competition_settings
  add column if not exists seeds_visible boolean not null default true;

-- Existing rows created before this migration get the default, so nothing
-- else is needed here — new competitions will inherit true as well.
