# OpinaCraft

OpinaCraft is a Next.js directory and management application for Minecraft communities.

## Requirements

- Node.js installed in the development environment.
- pnpm 11.9.0.
- A PostgreSQL database. Neon is the supported hosted provider.

Check the local runtime before working:

```bash
node --version
pnpm --version
```

## Installation

```bash
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` and fill in environment-specific values. Never commit `.env` or production secrets.

```bash
pnpm dev
```

The development server runs at `http://localhost:3000`.

## Environment and Neon

`DATABASE_URL` is the pooled Neon connection used by the application runtime.

`DIRECT_DATABASE_URL` is the direct, non-pooled Neon connection used only by Drizzle Kit. The migration configuration refuses to run when this variable is missing, so a pooled connection cannot be used accidentally for schema changes.

Inspect the database without changing it:

```bash
pnpm db:inspect
```

Apply migrations manually, in order, using the direct URL:

```bash
pnpm db:migrate
```

Migrations are not executed automatically during a Vercel build. Review the generated SQL, confirm the target database or Neon branch, and keep a recovery point when the provider makes one available before applying changes.

### Production migration workflow

Production migrations can be applied with the manual `Production database migration` GitHub Actions workflow. Before its first run:

1. Create a GitHub environment named `production` and configure at least one required reviewer. Do not run the workflow until this protection is in place.
2. Add an environment secret named `DIRECT_DATABASE_URL` containing the direct, non-pooled URL for the Production Neon branch.
3. After the reviewer protection is configured, run the workflow from `main` and enter `migrate-production` when prompted.

The workflow serializes migration runs, rejects Neon pooler URLs, applies all pending migrations, and inspects the resulting schema. The Vercel `DATABASE_URL` remains the pooled runtime connection and is not needed by this workflow.

The repository currently contains migrations for Better Auth, server management, Java/Bedrock MOTD verification, verified endpoint claims, tags/media, pg_trgm search, endpoint health, availability hiding, Blob quota counters, notification outbox and moderation/reporting. Review every generated migration before applying it to a database.

## Tests

Run the baseline checks:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

Integration tests use PostgreSQL and require `TEST_DATABASE_URL`, which must point to a dedicated Neon test branch or database. They never use the application URLs and roll back or clean up their test data.

```bash
pnpm test:integration
```

Do not point `TEST_DATABASE_URL` at Production. The integration command applies an idempotent, additive compatibility bootstrap to the dedicated test database before running the suite; production and development databases still require the normal `pnpm db:migrate` flow.

The critical E2E flow uses Playwright and covers account creation, server creation, publication, public listing, public detail, and management. It also checks the controlled offline verification error using `offline.example.invalid`; it does not use Discord, real email, or a public Minecraft server.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Local E2E requires `TEST_DATABASE_URL`. To test an already deployed environment, set `E2E_BASE_URL` to the Preview URL and keep the test data isolated.

## CI

GitHub Actions runs for pull requests targeting `main` and pushes to `main`. The workflows use the Node.js runtime available on the runner, install with `--frozen-lockfile`, and run lint, tests, and build with safe fictional build-time environment variables.

Integration and E2E database credentials are not embedded in CI. If those suites are enabled in a separate workflow, provide a dedicated test database through GitHub Secrets.

## Vercel deployment

The Vercel build command is `pnpm build`. It must not run database migrations.

For Preview:

- associate the Preview deployment with the intended branch and Neon test/preview branch;
- set `BETTER_AUTH_URL=https://preview.opinacraft.com`;
- configure `DATABASE_URL` with the pooled Preview connection;
- configure `DIRECT_DATABASE_URL` only for operator-run migrations;
- configure `BETTER_AUTH_SECRET` and `SERVER_VERIFICATION_SECRET` with Preview-only secrets;
- configure Discord OAuth callback URLs only if Discord is being tested;
- verify authentication, server creation/publication, public detail, member management, and MOTD verification;
- check function logs and confirm the Preview response has `noindex`.

Typical Vercel CLI validation commands are:

```bash
vercel pull --environment=preview
vercel build
vercel deploy --prebuilt
```

For Production, use the Production environment values, run reviewed migrations through the manual GitHub Actions workflow, and then deploy the same build without adding migration commands to the build step.

## Current phase notes

The public-beta foundation now includes email verification, safe callback redirects, keyboard tag autocomplete, fuzzy search, Vercel Blob WebP media uploads with quota guards and cleanup retries, Java/Bedrock endpoint verification and in-app monitoring, availability hiding, reporting/moderation, server deletion, account export and Spanish legal pages.

Vercel Blob is optional in local development. Preview/Production media uploads require `BLOB_READ_WRITE_TOKEN`; the deployed monitor requires `CRON_MONITOR_SECRET`, configured in Vercel and in the cron-job.org request. The GitHub workflow is manual-only for emergencies. Hobby quota counters default to 1 GB and 2,000 advanced operations and are conservative estimates; Vercel Observability remains the exact source for transfer, cache and monthly usage.

To trigger the monitor locally, add a development-only `CRON_MONITOR_SECRET` (at least 32 characters), start the app, and call the internal route:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_MONITOR_SECRET" }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/internal/monitor/run -Headers $headers
```

Only verified endpoints are checked. A successful check marks an endpoint online immediately; an unreachable endpoint needs three monitor runs before it becomes offline. Without this request, health remains `unknown`. For production scheduling, see [`docs/cron-job-monitor.md`](docs/cron-job-monitor.md).

The local seed leaves endpoint latency empty on purpose. The `latency_ms` value is written only by a successful Java/Bedrock monitor observation, so seeded servers show no ping until the worker has measured them.

After the initial bootstrap, grant platform roles from an operator shell with `pnpm admin:grant -- --email <email> --role admin|moderator`. Only admins can grant roles in the application.

The agreed implementation roadmap for the next phase is documented in
[`docs/phase-3-public-beta.md`](docs/phase-3-public-beta.md).
