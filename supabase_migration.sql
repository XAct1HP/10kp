-- Migration: Add thumbnail, text content, and default thumbnail support
-- Run this in your Supabase SQL Editor

-- 1. Add text_content column to pitches (for typed text pitches)
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS text_content TEXT;

-- 2. Add thumbnail_path column to pitches (for user-uploaded thumbnails)
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;

-- 3. Add default thumbnail columns to competition_settings
ALTER TABLE competition_settings ADD COLUMN IF NOT EXISTS default_audio_thumbnail TEXT;
ALTER TABLE competition_settings ADD COLUMN IF NOT EXISTS default_text_thumbnail TEXT;

-- 4. Create storage bucket for thumbnails (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Allow public read access to thumbnails bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public read access for thumbnails' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Public read access for thumbnails"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'thumbnails');
  END IF;
END $$;

-- 6. Allow authenticated users to upload thumbnails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload thumbnails' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Authenticated users can upload thumbnails"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'thumbnails' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- 7. Allow admins to upload default thumbnails (service role handles this via API)
-- The API uses the service role key, so no additional policy needed for admin uploads.
