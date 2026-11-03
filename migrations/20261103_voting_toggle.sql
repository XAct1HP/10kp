-- Master on/off switch for the public gallery ballot, flipped from the top
-- row of the admin Votes tab.
--
-- Off means the ballot is CLOSED, not hidden: vote counts keep showing
-- everywhere, but POST/DELETE /api/gallery/votes refuse, so the tally is
-- frozen rather than merely un-clickable. The ballot is unauthenticated by
-- design (see docs/VOTE_INTEGRITY.md), so hiding the button alone would
-- leave a curl loop perfectly able to vote.
--
-- Default true so voting stays open on existing installs until an admin
-- turns it off.

alter table public.competition_settings
  add column if not exists voting_enabled boolean not null default true;
