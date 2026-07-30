# OpinaCraft

OpinaCraft is a Next.js directory and management application for Minecraft communities.

## Requirements

- Node.js 22 (`.node-version` is the source of truth).
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

The repository currently contains migrations for Better Auth, server management, Java MOTD verification, verified endpoint claims, removal of the residual `tests` table, and validation of the endpoint port constraint.

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

Do not point `TEST_DATABASE_URL` at Production. Apply the current migrations to the dedicated test database with its direct connection before running the suite.

The critical E2E flow uses Playwright and covers account creation, server creation, publication, public listing, public detail, and management. It also checks the controlled offline verification error using `offline.example.invalid`; it does not use Discord, real email, or a public Minecraft server.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Local E2E requires `TEST_DATABASE_URL`. To test an already deployed environment, set `E2E_BASE_URL` to the Preview URL and keep the test data isolated.

## CI

GitHub Actions runs for pull requests targeting `main` and pushes to `main`. The workflow pins Node 22, uses pnpm caching, installs with `--frozen-lockfile`, and runs lint, tests, and build with safe fictional build-time environment variables.

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

For Production, use the Production environment values, run reviewed migrations separately against the Production direct connection, and then deploy the same build without adding migration commands to the build step.

## Known limitations

The following are intentionally deferred to the next product phase: tags, search, filters, reviews, votes, moderation, monitoring, images, Bedrock verification, invitations, server deletion, and ownership transfer.

Email verification is represented in the Better Auth schema but does not yet have an application email/confirmation flow. Discord OAuth and Resend are optional integrations.
