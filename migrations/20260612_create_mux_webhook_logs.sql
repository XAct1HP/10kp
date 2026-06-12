create table if not exists public.mux_webhook_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  event_type text,
  status text not null,
  upload_id text,
  asset_id text,
  playback_id text,
  passthrough text,
  matched_pitch_id uuid references public.pitches(id) on delete set null,
  matched_by text,
  message text,
  payload jsonb
);

create index if not exists mux_webhook_logs_created_at_idx
  on public.mux_webhook_logs (created_at desc);

alter table public.mux_webhook_logs enable row level security;
