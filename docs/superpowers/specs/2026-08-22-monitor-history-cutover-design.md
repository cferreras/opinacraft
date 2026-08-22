# Monitor history cutover and completed-interval design

## Context

OpinaCraft moved frequent Minecraft monitoring from Neon to a dedicated
PostgreSQL Monitor database in Dokploy. The worker, Monitor API, public status,
and new history samples are now operating correctly without keeping Neon
active. Two defects remain:

1. Historical samples that existed in Neon were not copied successfully to
   PostgreSQL Monitor.
2. The 24-hour availability rail always renders the current, incomplete
   15-minute interval as `no_data`. Once that interval receives a sample and
   turns green, the next open interval appears as a new grey block.

The two recent green blocks visible after the cutover are consistent with an
immediate check scheduled by target reconciliation followed by the first
periodic worker check. They do not prove that the old history was migrated.

## Goals

- Copy the existing Neon monitor history to PostgreSQL Monitor exactly once in
  operational terms, while keeping the command safe to rerun.
- Verify the migration by server and time range instead of relying only on a
  successful process exit.
- Keep Neon completely outside runtime monitor reads and checks after the
  backfill.
- Stop representing an interval that has not finished as missing history.
- Preserve genuine gaps for completed intervals that should have received a
  sample but did not.
- Keep public status and history fresh without introducing a long-lived or
  contradictory cache.

## Non-goals

- Reintroducing a runtime fallback from Monitor API to Neon.
- Changing the 15- or 60-minute monitoring cadence.
- Redesigning the worker, pg-boss queue, or reconciliation protocol.
- Hiding real missed checks or fabricating samples for periods without data.

## Data boundaries

Neon is a read-only source only while an operator runs
`pnpm monitor:db:backfill`. PostgreSQL Monitor is the destination and remains
the sole runtime source for status and history. The command requires both
`DATABASE_URL` and `MONITOR_DATABASE_URL`, never logs either value, and closes
both pools when it finishes.

The public runtime flow remains:

```text
Browser -> Next history API -> Monitor API -> PostgreSQL Monitor
```

No public, managed, reconciliation, or worker request may read historical
monitor tables in Neon after the cutover.

## Backfill behavior

### Preflight

Before writing, the command reads the eligible target IDs and records source
counts, earliest timestamps, and latest timestamps for raw snapshots and hourly
aggregates, grouped by server. A missing source table is reported explicitly;
it is not silently treated as a successful zero-row migration when targets
exist.

### Import

The destination work runs in a transaction:

1. Upsert current target metadata and verified endpoints.
2. Import raw snapshots by the canonical `(server_id, scheduled_at)` key.
   Existing destination snapshots win on a collision so live post-cutover
   observations cannot be overwritten by old data.
3. Treat legacy hourly rows as the base aggregate for their bucket.
4. Rebuild overlapping hourly buckets deterministically by combining that
   legacy base with destination snapshots observed after the legacy row's
   `last_observed_at`. This preserves samples written by the new worker during
   the cutover without counting the legacy samples twice.
5. Rebuild derived state-transition history from the resulting canonical
   timeline.

The hourly rebuild replaces the computed destination value for each affected
bucket. It never increments an existing aggregate blindly. Running the command
again therefore produces the same result rather than duplicating counts.

### Verification

Before commit, verification checks every migrated server:

- every source snapshot key exists in the destination;
- the destination covers at least the source minimum and maximum timestamps;
- every source hourly bucket exists in the destination;
- deterministic hourly totals match the legacy base plus post-cutover samples;
- no target with source history unexpectedly has zero destination history.

Any mismatch rolls back the destination transaction and exits unsuccessfully.
On success, the command prints a secret-free JSON summary with target, snapshot,
hourly-bucket, transition, and verification counts.

## Interval semantics

An availability point represents a closed interval unless that interval already
contains a real sample. History construction therefore uses these rules:

1. Calculate the start of the current interval from `now` and the response
   resolution.
2. If the current interval contains at least one sample, include it with its
   real status.
3. If it contains no sample, end the series at the preceding completed
   interval. Do not synthesize a `no_data` point for the open interval.
4. Continue producing `no_data` for any earlier completed interval with no
   sample. Those gaps represent an actual missed or unavailable check.

This keeps the requested rolling period truthful while removing the permanent
trailing grey block. When a sample arrives in the current interval, that point
may appear immediately without waiting for the interval to close.

## Public cache and UI

The Next history route fetches Monitor API with `no-store`. Its public response
may use a short shared cache no longer than the existing status cache, while
the browser must revalidate. The ETag changes whenever the included monitor
data changes. Cache constants should be shared rather than independently
duplicated across status, catalog, and history paths.

The availability legend exposes all rendered meanings:

- green: `En línea`;
- red: `Sin respuesta`;
- yellow: `Sin comprobar` for a completed check with an inconclusive result;
- grey: `Sin histórico` for a completed interval without a sample.

The history footer derives its latest timestamp from the newest sample actually
included in the returned series. It does not use a newer state timestamp that
the graph does not yet contain. If the requested period begins before the first
available sample, the card states when data in that period becomes available.

If Monitor API is unavailable, Next returns `503` and the card shows a retryable
error. It never substitutes empty data or falls back to Neon.

## Testing

Implementation follows RED-GREEN TDD and adds regressions for:

- excluding an empty current interval;
- including the current interval as soon as it contains a sample;
- retaining a genuine empty completed interval;
- using the latest included sample in the history footer;
- exposing `Sin histórico` in the availability legend;
- importing source history for all eligible server IDs;
- rerunning the backfill without increasing counts;
- merging a legacy hourly bucket with post-cutover live samples exactly once;
- rolling back when per-server verification detects missing history;
- keeping public history on Monitor API with no Neon runtime fallback;
- applying the agreed short cache/revalidation contract.

Validation includes focused monitor/history tests, the complete unit suite,
ESLint, TypeScript, `git diff --check`, and a browser check against the already
running application at desktop and mobile widths. Database integration is run
only against explicitly configured test databases; production credentials are
not required for the code validation.

## Deployment and operational verification

1. Deploy the tested worker, Monitor API, and web changes.
2. Back up PostgreSQL Monitor or confirm a recoverable snapshot exists.
3. Run the idempotent backfill once with production source and destination
   credentials from an operator environment.
4. Require the command's verification summary to succeed before considering
   the cutover complete.
5. Compare representative 24-hour and longer histories with the source counts.
6. Confirm that new samples continue at their configured cadence and that the
   availability rail has no empty open interval.
7. Confirm through database connection metrics that ordinary monitor runtime
   traffic does not open Neon.

The backfill never deletes source data. A failed verification rolls back. If an
issue is discovered after commit, restore the Monitor database snapshot or run
a corrected deterministic rebuild; do not enable a runtime Neon fallback.
