alter table public.pitches
  add column if not exists mux_error text;
