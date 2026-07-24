-- Fix pitches_protect_moderation trigger to use auth.role() instead of
-- the deprecated `request.jwt.claim.role` setting.
--
-- On modern PostgREST / Supabase, individual claim settings
-- (`request.jwt.claim.X`) are no longer populated — the trigger's IF
-- check always evaluated to false, causing every server-side moderation
-- update (from getSupabaseAdmin()) to be silently reverted. Pitches got
-- stuck in `not_started` because the service-role update to `queued`
-- was rolled back by the trigger.
--
-- This migration replaces the function body. The trigger itself is
-- unchanged and continues to fire before every update.

create or replace function public.pitches_protect_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role bypass. auth.role() reads the JWT role via Supabase's
  -- helper (works on all current PostgREST versions). current_user is a
  -- fallback for direct SQL calls (rare).
  if auth.role() = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  -- v1 moderation columns
  new.moderation_status := old.moderation_status;
  new.moderation_reason := old.moderation_reason;
  new.moderation_flags := old.moderation_flags;
  new.moderation_transcript := old.moderation_transcript;
  new.moderation_reviewed_by := old.moderation_reviewed_by;
  new.moderation_reviewed_at := old.moderation_reviewed_at;
  new.moderation_priority := old.moderation_priority;
  new.moderation_checked_at := old.moderation_checked_at;

  -- v2 state columns
  new.moderation_state := old.moderation_state;
  new.moderation_version := old.moderation_version;
  new.moderation_source := old.moderation_source;
  new.moderation_started_at := old.moderation_started_at;
  new.moderation_completed_at := old.moderation_completed_at;
  new.moderation_summary := old.moderation_summary;
  new.moderation_reasons := old.moderation_reasons;
  new.moderation_categories := old.moderation_categories;
  new.moderation_scores := old.moderation_scores;
  new.moderation_admin_notes := old.moderation_admin_notes;
  new.moderation_attempt_count := old.moderation_attempt_count;
  new.moderation_last_attempt_at := old.moderation_last_attempt_at;
  new.moderation_next_attempt_at := old.moderation_next_attempt_at;
  new.moderation_last_error := old.moderation_last_error;

  -- v2 sub-component results
  new.visual_moderation_status := old.visual_moderation_status;
  new.visual_moderation_result := old.visual_moderation_result;
  new.transcript_moderation_status := old.transcript_moderation_status;
  new.transcript_moderation_result := old.transcript_moderation_result;

  -- Transcript pipeline
  new.transcript := old.transcript;
  new.transcript_status := old.transcript_status;
  new.transcript_language := old.transcript_language;
  new.transcript_last_error := old.transcript_last_error;

  -- Media state
  new.media_status := old.media_status;

  -- Mux Robots
  new.mux_moderation_job_id := old.mux_moderation_job_id;
  new.mux_moderation_result := old.mux_moderation_result;

  return new;
end;
$$;
