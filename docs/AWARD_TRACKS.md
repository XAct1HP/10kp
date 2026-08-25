# Award Tracks

Tags and awards used to be the same thing: the tags on a pitch decided which
awards it was considered for. They are now separate.

* **Tags** describe the pitch. They carry no award weight at all.
* **Award tracks** are what the pitch competes for. The submitter picks them
  on the intake form, and an AI relevance check decides whether each pick
  sticks.

## The flow

```
submit → pitch_awards rows written with status 'pending'
       → moderation runs
       → APPROVED?  no  → rows stay 'pending' forever; the pitch is in no track
                    yes → relevance check scores the pitch against each award's
                          criteria → 'eligible' or 'removed'
```

The check only ever runs on an approved pitch. A rejected or flagged pitch is
in no award track, which is the intended behavior — nothing to clean up.

## Setting up an award

Admin → Settings → Awards.

* **Description** — public. Shows on the Rules page *and* under the award on
  the intake form, so keep it to a sentence or two.
* **Relevance criteria** — admin only. This is what the pitch is actually
  scored against. Be concrete about what qualifies and what doesn't; "must be
  a physical product, not an app" beats "innovative hardware". Blank criteria
  fall back to the description.
* **Automatic entry** — the Weekly Raffle. Hidden from the intake picker,
  never scored, every approved pitch is in it. Exactly one award can hold this
  flag; setting it on a second award clears the first (a partial unique index
  enforces it in the database too).

Criteria live in their own table (`award_criteria`) with no RLS select policy,
so they are unreachable from the browser. `awards` itself is world-readable —
if criteria lived there, submitters could read the rubric. Don't move them.

## What the check will and won't do

It is deliberately lopsided. Dropping a student from a track they belong in is
a worse failure than leaving a marginal pitch in, so:

* Only a clear, confident `no_match` removes a track.
* A malformed response, a missing verdict, an unrecognized verdict, an empty
  transcript, or a UMGPT outage all leave the pitch **in** the track, marked
  `unverified` so an admin can see the check didn't really run.
* An admin decision (`overridden_by`) is final — a later run never revisits it.

## Where it runs

1. `lib/moderation/pipeline.js` fires it (unawaited) when a pitch goes
   APPROVED. Not awaited because text pitches run the pipeline inline inside a
   60s request.
2. `app/api/admin/pitches/moderation` awaits it on a manual approve.
3. `app/api/cron/moderation-reconcile` sweeps anything still `pending` on an
   approved pitch. This is the durable backstop — Vercel can kill the
   background promise from (1) once the response flushes.

On a transient provider failure the first attempt leaves the row pending and
stamps `checked_at` as an attempt marker; the second failure gives up and
marks the row eligible/unverified rather than retrying forever.

## Admin controls

The pitch detail modal has an **Award tracks** panel: every selection, the
verdict and reason behind it, and buttons to remove, put back, or re-check.
Removing/adding stamps the override. "Re-check" clears the override and the
old verdict and re-runs the check from the pitch's current transcript.

Filters: **Pitches** tab filters by award track (matching only tracks a pitch
is actually still in); **Outreach** filters accounts by award track and by
tag, and both the CSV export and the broadcast follow whatever is filtered.
The pitch CSV gained `Award Tracks` and `Award Tracks Removed` columns.

## Migration

`migrations/20260825_award_tracks.sql`. Safe to re-run. It also widens the
`moderation_audit` action check constraint — without that, award overrides
write no audit row (the write is swallowed by design).
