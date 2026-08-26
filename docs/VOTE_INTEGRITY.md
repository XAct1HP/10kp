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

## The pieces

| File | Role |
| --- | --- |
| `lib/voteFingerprint.js` | Turns a request into salted hashes stored with the vote |
| `lib/voteIntegrity.js` | Pure scoring engine — clusters and signals, no I/O |
| `app/api/cron/vote-integrity/route.js` | Hourly sweep; writes `vote_flags` |
| `app/api/admin/vote-flags/route.js` | Admin triage: list, review, void |
| `app/admin/page.jsx` → Votes → Integrity | The queue |
| `migrations/20260826_vote_integrity.sql` | Schema |
| `__tests__/vote-integrity.test.js` | Engine tests |

## What gets stored

Fingerprint columns on `pitch_votes`, all nullable — a missing header
must never cost someone their vote:

- `ip_hash` — salted SHA-256 of the client IP, truncated to 128 bits
- `ip_prefix_hash` — same, over the /24 (v4) or /48 (v6) block
- `user_agent_hash` — same, over the UA string
- `geo_country`, `geo_region`, `geo_city` — Vercel edge headers, in the clear

**No raw IP or user-agent is ever written.** The digests support exactly
one operation: equality. Rotating `VOTE_FINGERPRINT_SALT` invalidates
every stored fingerprint at once. If that variable is unset the salt
falls back to `SUPABASE_SERVICE_ROLE_KEY`, which works but means rotating
that key silently rotates all fingerprints — set it explicitly in prod.

## How scoring works

The engine buckets every vote under four *anchors*: email stem, exact IP,
subnet + browser, display name. Any anchor holding two or more distinct
identities becomes a candidate cluster and gets scored out of 100.

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
- **Narrow cadence and ballot rules.** "Machine-like timing" only fires
  when the mean gap is under five minutes, and "identical ballots" only
  counts ballots of two or more pitches. Both of these caught real false
  positives in testing — honest voters keep regular hours, and plenty of
  honest people spend exactly one of their five votes.

Self-voting is checked separately, per pitch, because it involves one
identity and the clustering pass would never see it.

Severity: `high` ≥ 60, `medium` ≥ 35, otherwise `low`. Below
`MIN_SCORE` (25) nothing is written at all.

## Triage

The hourly cron upserts on `cluster_key`, so a ring that grows between
runs updates its existing row and **keeps its triage status and reviewer
note** rather than reappearing as a fresh flag. A cluster that stops
scoring — usually because its votes were voided — is marked `resolved`
rather than deleted, so the audit trail survives.

In the admin queue each flag can be:

- **Not suspicious** → `dismissed`
- **Confirm, keep votes** → `confirmed` (recorded, tally untouched)
- **Void these votes** → deletes exactly the votes attributed to that
  cluster and marks it `actioned`

The void endpoint intersects the requested ids with the flag's own
`vote_ids`, so it cannot be used to reach arbitrary votes.

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
`SELF_VOTE_BASE`, `CADENCE_MAX_MEAN_MS`, `MIN_BALLOT_SIZE_FOR_TWINS`.
The engine is pure, so change a weight and run `npm test` to see what
moves. The lookback window (45 days) and vote cap live in the cron route.

## Setup checklist

1. Apply `migrations/20260826_vote_integrity.sql` in Supabase.
2. Set `VOTE_FINGERPRINT_SALT` to a long random string in Vercel.
3. Confirm `CRON_SECRET` is set (shared with the moderation cron).
4. The hourly schedule is already in `vercel.json`.

Fingerprints only exist for votes cast *after* the migration and deploy.
Older votes still get scored on email, name, timing and ballot shape.
