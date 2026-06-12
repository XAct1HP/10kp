-- ============================================
-- 10KP Supabase Setup
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Tags table (populate with your tags later)
create table if not exists public.tags (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  created_at timestamptz default now()
);

-- 2. Pitches table
create table if not exists public.pitches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  role text,
  schools text[] default '{}',
  title text not null,
  description text not null,
  file_path text,
  file_name text,
  created_at timestamptz default now()
);

-- Extend pitches for Mux video processing workflow
alter table public.pitches
  add column if not exists file_type text default 'file',
  add column if not exists mux_upload_id text,
  add column if not exists mux_asset_id text,
  add column if not exists mux_playback_id text,
  add column if not exists mux_error text,
  add column if not exists mux_status text default 'pending';

create index if not exists pitches_mux_status_idx on public.pitches (mux_status);

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

-- 3. Pitch-Tags join table (many-to-many)
create table if not exists public.pitch_tags (
  pitch_id uuid references public.pitches(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (pitch_id, tag_id)
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
alter table public.tags enable row level security;
alter table public.pitches enable row level security;
alter table public.pitch_tags enable row level security;
alter table public.mux_webhook_logs enable row level security;

-- Tags: anyone authenticated can read
create policy "Anyone can read tags"
  on public.tags for select
  to authenticated
  using (true);

-- Pitches: users can insert their own
create policy "Users can insert own pitches"
  on public.pitches for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Pitches: users can read their own
create policy "Users can read own pitches"
  on public.pitches for select
  to authenticated
  using (auth.uid() = user_id);

-- Pitches: users can update their own
create policy "Users can update own pitches"
  on public.pitches for update
  to authenticated
  using (auth.uid() = user_id);

-- Pitch Tags: users can insert for their own pitches
create policy "Users can insert own pitch tags"
  on public.pitch_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.pitches
      where pitches.id = pitch_id
        and pitches.user_id = auth.uid()
    )
  );

-- Pitch Tags: users can read their own pitch tags
create policy "Users can read own pitch tags"
  on public.pitch_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.pitches
      where pitches.id = pitch_id
        and pitches.user_id = auth.uid()
    )
  );

-- ============================================
-- Storage Bucket
-- ============================================

-- Create the pitch-files bucket (run once)
insert into storage.buckets (id, name, public)
values ('pitch-files', 'pitch-files', false)
on conflict (id) do nothing;

-- Storage policy: authenticated users can upload to their own folder
create policy "Users can upload own pitch files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pitch-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policy: users can read their own files
create policy "Users can read own pitch files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pitch-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- 4. Competition Settings table (single-row)
-- ============================================

create table if not exists public.competition_settings (
  id uuid default gen_random_uuid() primary key,
  competition_date timestamptz,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.competition_settings enable row level security;

-- Anyone authenticated can read the competition date
create policy "Anyone can read competition settings"
  on public.competition_settings for select
  to authenticated
  using (true);

-- Note: Insert/update handled via service role key in API routes (admin-only)

-- ============================================
-- Example: Insert some starter tags
-- (replace these with your actual tags later)
-- ============================================
-- insert into public.tags (name) values
--   ('Technology'),
--   ('Healthcare'),
--   ('Finance'),
--   ('Education'),
--   ('Social Impact');
