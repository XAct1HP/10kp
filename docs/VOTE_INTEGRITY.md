# Vote integrity

## The problem

The gallery ballot is open on purpose. `POST /api/gallery/votes` takes a
name and an email straight from the request body — no session, no
verification, no `@umich.edu` restriction — because we want anyone,
anywhere, to be able to vote on U-M pitches. The voter's identity is
whatever they typed into the modal, cached in `localStorage`.

That means a second identity costs nothing. A `curl` loop with
`a1@x.com`, `a2@x.com`, … works as well as a second browser does.

We are not closing the ballot. So the strategy is: capture enough signal
on each vote to recognise the same person coming back, score how much a
group of identities looks like one person, and put the result in front of
a human. **Nothing in this system removes a vote automatically.**

One exception to "we don't prevent anything", added 2026-09-04: the vote
budget is enforced per **mailbox**, not per address string. Sub-address
tags and gmail dots don't change where mail is delivered, so
`mziaulh+mark@` and `mziaulh+omair@` share one allowance. That isn't a
guess about identity, it's how SMTP works — and it is the difference
between a five-vote limit that means something and one that doesn't.

## What went wrong on 2026-09-04

Twelve votes arrived from twelve sub-addresses of one mailbox, onto a
pitch submitted by the owner of that mailbox, inside eight minutes. The
Integrity queue stayed empty.

Replaying that cluster against the engine scores it **100/high**. The
scoring was never the problem. What failed:

1. **Detection was hourly-only.** Even a perfectly working cron leaves a
   sixty-minute window in which a ballot can be stuffed while the admin
   watching the Votes tab sees a clean screen.
2. **Nothing recorded whether the sweep ran.** The tab renders an
   identical "Nothing flagged" whether the detector found nothing, was
   never scheduled (Vercel Hobby quietly downgrades an hourly cron to
   daily), or 401'd on an unset `CRON_SECRET`. An empty queue was
   indistinguishable from a dead detector.

Probing around the incident found two real scoring holes as well:

3. **The dispersion penalty applied to mailbox clusters.** Spread the
   same twelve aliases across five pitches and the score fell 100 → 49.
   Dispersion is evidence that an anchor was circumstantial; a shared
   mailbox never is.
4. **No anchor meant no cluster.** Vary the inbox, the address, the name
   and the browser, and twelve votes landing on one pitch in eight
   minutes produced *zero findings* — the clustering pass can only see a
   ring through something two identities share.

All four are addressed below. The regression tests for each are at the
bottom of `__tests__/vote-integrity.test.js`.

## The pieces

| File | Role |
| --- | --- |
| `lib/voteFingerprint.js` | Turns a request into hashes + raw IP/UA stored with the vote |
| `lib/voteIntegrity.js` | Pure scoring engine — clusters and signals, no I/O |
| `lib/voteRealtime.js` | Vote-time check over a narrow slice; runs in the request path |
| `lib/voteSweep.js` | The full sweep, shared by the cron and the manual button |
| `app/api/cron/vote-integrity/route.js` | Hourly sweep trigger |
| `app/api/admin/vote-flags/route.js` | Admin triage: list, review, void |
| `app/api/admin/vote-flags/sweep/route.js` | Sweep health + "run sweep now" |
| `app/api/admin/votes/route.js` | Audit trail; void / restore individual votes |
| `app/admin/page.jsx` → Votes | The trail and the queue |
| `migrations/20260826_vote_integrity.sql` | Schema |
| `migrations/20260904_vote_integrity_v2.sql` | Canonical inbox, raw IP, soft-void, sweep log |
| `__tests__/vote-integrity.test.js` | Engine tests |

## What gets stored

Fingerprint columns on `pitch_votes`, all nullable — a missing header
must never cost someone their vote:

- `ip_hash` — salted SHA-256 of the client IP, truncated to 128 bits
- `ip_prefix_hash` — same, over the /24 (v4) or /48 (v6) block
- `user_agent_hash` — same, over the UA string
- `geo_country`, `geo_region`, `geo_city` — Vercel edge headers, in the clear

The digests support exactly one operation: equality. Rotating
`VOTE_FINGERPRINT_SALT` invalidates every stored fingerprint at once. If
that variable is unset the salt falls back to
`SUPABASE_SERVICE_ROLE_KEY`, which works but means rotating that key
silently rotates all fingerprints — set it explicitly in prod.

Since 2026-09-04 the **raw** address and user-agent are stored too, in
`ip_address` and `user_agent`. This reverses the original stance, and the
reason is worth being explicit about: during an incident the question is
never "are these two votes from the same place?" — the hash answers that
— it is "*what* place, and does that look like a lecture hall or a
bedroom?", which a hash cannot answer at all.

The limits on that:

- Reachable only through service-role admin routes. RLS on `pitch_votes`
  is unchanged and no policy exposes these columns.
- The hashes remain what the detector groups on, so the engine keeps
  working after a purge.
- **Purge them when results are final:** `select public.purge_vote_pii(30);`
  nulls both columns for votes older than the given number of days and
  leaves the hashes intact.

Also stored: `voter_inbox`, the canonical mailbox behind the address
(`canonicalInbox()` in `lib/voteIntegrity.js`, mirrored in SQL as
`public.vote_canonical_inbox()` — change both together).

## How scoring works

The engine buckets every vote under four *anchors*: email stem, exact IP,
subnet + browser, display name. Any anchor holding two or more distinct
identities becomes a candidate cluster and gets scored out of 100.

A fifth detector, **pitch velocity**, doesn't use an anchor at all: it
slides a fifteen-minute window over each pitch's votes and reports the
densest one. It exists because the four anchors above are all attributes
the attacker controls, and varying every one of them made a twelve-vote
wave invisible. The gate that keeps honest spikes out is *single
purpose*: a window only reports if ≥80% of the identities in it have
never voted for anything else. Real people who arrive from a group chat
generally spend more than one of their five votes; manufactured ones
spend exactly one and are never seen again. A velocity finding is also
suppressed when the clustering pass already covers the same voters, so
one ring is one row in the queue.

Signals and weights live in `SIGNAL_WEIGHTS` at the top of
`lib/voteIntegrity.js`. They are arranged so **no single weak signal
clears `MIN_SCORE` on its own** — a flag needs corroboration. Two people
who happen to share a common display name score 16 against a threshold of
25 and never surface.

Two deliberate brakes on false positives:

- **Dispersion penalty.** A cluster spread across four or more pitches
  with no clear favourite loses 18 points and forfeits its group-size
  escalation. This is what campus wifi looks like: many identities, one
  NAT, voting for all sorts of things. It is *not* what a ring looks like.
  It does **not** apply to a cluster held together by a provable shared
  mailbox (`plus_alias`), because spreading out explains a coincidental
  anchor and cannot explain one inbox holding twelve ballots.
- **Narrow cadence and ballot rules.** "Machine-like timing" only fires
  when the mean gap is under five minutes, and "identical ballots" only
  counts ballots of two or more pitches. Both of these caught real false
  positives in testing — honest voters keep regular hours, and plenty of
  honest people spend exactly one of their five votes.

`plus_alias` (40) and `email_stem` (32) are deliberately separate. The
first is a *fact* — those addresses deliver to one mailbox. The second is
a guess: `mark1@` and `mark2@` collapse to the same stem and may well be
two different people, which is why it stays weak and keeps the dispersion
penalty.

Self-voting is checked separately, per pitch, because it involves one
identity and the clustering pass would never see it.

Severity: `high` ≥ 60, `medium` ≥ 35, otherwise `low`. Below
`MIN_SCORE` (25) nothing is written at all.

## When detection runs

Two paths, same engine:

- **On write** (`lib/voteRealtime.js`), from the vote route. Scores a
  narrow slice — the mailbox that just voted, the address it voted from,
  the pitch it voted for, plus the full history of every identity in that
  slice so `single_purpose` isn't answered from a keyhole. Bounded by a
  2.5s budget, runs *after* the insert, and swallows every error: a vote
  must never be lost because the detector had a bad day.
- **Hourly** (`lib/voteSweep.js`), from Vercel Cron, or on demand from
  the **Run sweep now** button in the Integrity tab. Sees the whole
  45-day window, catches slow drips no single vote makes obvious, and
  resolves flags that no longer hold.

Both upsert on the same `cluster_key`, so a ring caught on the way in and
re-seen by the sweep stays one row with one triage state.

Every sweep writes a row to `vote_sweeps` — success or failure — and the
Integrity tab shows when the detector last actually ran, turning red when
it hasn't run in two hours. **If that strip is red, fix that before
trusting an empty queue.** The usual causes are a Vercel plan that
downgrades hourly crons to daily, or an unset `CRON_SECRET`.

## Triage

The hourly cron upserts on `cluster_key`, so a ring that grows between
runs updates its existing row and **keeps its triage status and reviewer
note** rather than reappearing as a fresh flag. A cluster that stops
scoring — usually because its votes were voided — is marked `resolved`
rather than deleted, so the audit trail survives.

In the admin queue each flag can be:

- **Not suspicious** → `dismissed`
- **Confirm, keep votes** → `confirmed` (recorded, tally untouched)
- **Void these votes** → voids exactly the votes attributed to that
  cluster and marks it `actioned`

The void endpoint intersects the requested ids with the flag's own
`vote_ids`, so it cannot be used to reach arbitrary votes.

Individual votes can also be voided straight from **Votes → Audit
Trail**, with a required reason. That path exists because triage from the
queue only works on votes the detector already grouped — when twelve
obvious alias votes are on screen, needing the detector's permission to
act on them is the wrong way round.

**Voiding is soft.** `voided_at` / `voided_by` / `void_reason` are set;
the row stays in the trail, struck through, and can be restored. Every
tally filters `voided_at is null` — the gallery, analytics, the admin
pitch list, the vote budget, and the sweep's own input (so a voided vote
can't keep resurrecting the flag that got it voided). Votes used to be
deleted outright, which destroyed the evidence at the moment somebody had
just decided it mattered, and made a mistaken void unrecoverable.

The trail also does some of the detector's job by eye: an address that is
a sub-address of another mailbox carries an **alias** badge, and a
**×n** badge shows how many votes in view come from that same mailbox.

## Reading a flag honestly

Every signal here has an innocent explanation. Roommates share a router.
A lecture hall shares a NAT. Two people really are called John Smith. A
pitch shared in a group chat really does draw ten votes in four minutes.
The score says "this deserves a look", never "this is fraud" — and the
evidence panel exists so a human can tell the difference.

## Tuning

Everything adjustable is a named export at the top of
`lib/voteIntegrity.js`: `SIGNAL_WEIGHTS`, `DISPERSION_PENALTY`,
`MIN_SCORE`, `MEDIUM_SCORE`, `HIGH_SCORE`, `BURST_WINDOW_MS`,
`SELF_VOTE_BASE`, `CADENCE_MAX_MEAN_MS`, `MIN_BALLOT_SIZE_FOR_TWINS`,
`PITCH_BURST_WINDOW_MS`, `PITCH_BURST_MIN_VOTERS`,
`PITCH_BURST_SINGLE_PURPOSE_SHARE`.
The engine is pure, so change a weight and run `npm test` to see what
moves. The lookback window (45 days) and vote cap live in
`lib/voteSweep.js`; the realtime slice's budget lives in
`lib/voteRealtime.js`.

When you add or reweight a signal, add a test that proves an *innocent*
pattern still doesn't flag. Four are already there — campus NAT, a
group-chat spike, a genuinely popular pitch, and digit-variant addresses
— and each of them was a false positive caught during development.

## Setup checklist

1. Apply `migrations/20260826_vote_integrity.sql` in Supabase, then
   `migrations/20260904_vote_integrity_v2.sql`.
2. Watch the v2 output for a `NOTICE` about
   `pitch_votes_pitch_inbox_key`. If it appears, alias votes already in
   the table are colliding — the notice carries the query to find them.
   Void the duplicates in the admin Votes tab and re-run the migration,
   otherwise the one-vote-per-mailbox rule is enforced only in the API.
3. Set `VOTE_FINGERPRINT_SALT` to a long random string in Vercel.
4. Confirm `CRON_SECRET` is set (shared with the moderation cron).
5. The hourly schedule is already in `vercel.json`. **Verify it actually
   fires**: open Votes → Integrity and check the status strip, or press
   *Run sweep now* and compare. On Vercel Hobby, hourly crons are
   silently downgraded to daily.
6. Schedule or diarise `select public.purge_vote_pii(30);` for after the
   results are announced.

Note on the vote limit: it is enforced in three places, deliberately
overlapping. The API route counts by `voter_inbox` and is the only layer
that can explain itself to the voter; the partial unique index
`pitch_votes_pitch_inbox_key` stops a race; and the pre-existing Supabase
trigger that raises `MAX_VOTES_REACHED` still counts by `voter_key`. That
trigger lives in the database rather than in this repo — it is now the
loosest of the three and a per-address backstop only.

Fingerprints only exist for votes cast *after* the migration and deploy.
Older votes still get scored on email, name, timing and ballot shape.
