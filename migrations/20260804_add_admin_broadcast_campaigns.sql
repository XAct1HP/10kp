create table if not exists public.admin_broadcast_campaigns (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz not null default now(),
  created_by text,
  subject text not null,
  body_text text not null,
  recipient_scope text not null default 'all',
  confirmed_filter text not null default 'all',
  recipient_count integer not null default 0,
  resend_segment_id text,
  resend_broadcast_id text,
  status text not null default 'sent',
  details jsonb not null default '{}'::jsonb
);

create index if not exists admin_broadcast_campaigns_created_at_idx
  on public.admin_broadcast_campaigns (created_at desc);

alter table public.admin_broadcast_campaigns enable row level security;
