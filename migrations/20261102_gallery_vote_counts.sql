-- Lightweight gallery vote tallies.
-- Replaces paging every pitch_votes row (which exhausted the PostgREST pool
-- once live vote volume passed a few thousand).

create or replace function public.gallery_vote_counts(p_pitch_ids uuid[])
returns table (pitch_id uuid, vote_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.pitch_id, count(*)::bigint as vote_count
  from public.pitch_votes v
  where v.voided_at is null
    and v.pitch_id = any (p_pitch_ids)
  group by v.pitch_id;
$$;

revoke all on function public.gallery_vote_counts(uuid[]) from public;
grant execute on function public.gallery_vote_counts(uuid[]) to service_role;
grant execute on function public.gallery_vote_counts(uuid[]) to authenticated;
grant execute on function public.gallery_vote_counts(uuid[]) to anon;
