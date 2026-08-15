-- Per-sponsor display options for the homepage spinning-disk spotlight.
--
--   • light_background: some logos (dark artwork, dark type) are unreadable
--     on the default navy disk. When true, the disk cross-fades to a light
--     face while that sponsor is visible.
--
--   • size_multiplier: source PNGs vary wildly in whitespace/aspect ratio,
--     so the visual size of two "equally big" logos rarely matches. This
--     multiplier scales the rendered logo (1.0 = default; 0.8 = shrink 20%;
--     1.3 = enlarge 30%). Any positive number is allowed but the UI is
--     capped at [0.1, 3.0] to keep values sane.

alter table public.sponsors
  add column if not exists light_background boolean not null default false;

alter table public.sponsors
  add column if not exists size_multiplier numeric(4, 2) not null default 1.00;

-- Guard against absurd values landing via a bad API call.
alter table public.sponsors
  drop constraint if exists sponsors_size_multiplier_range;
alter table public.sponsors
  add constraint sponsors_size_multiplier_range
    check (size_multiplier > 0 and size_multiplier <= 5);
