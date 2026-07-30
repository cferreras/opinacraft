This is the OpinaCraft Next.js application.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment

Use Neon’s pooled PostgreSQL URL as `DATABASE_URL` at runtime and Neon’s direct (non-pooled) URL as `DIRECT_DATABASE_URL` for Drizzle Kit. Set `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL`, and a random `SERVER_VERIFICATION_SECRET` (at least 32 bytes) before enabling MOTD verification. Rotating the verification secret invalidates pending codes, so owners must generate new ones. `BETTER_AUTH_TRUSTED_ORIGINS` accepts a comma-separated list of allowed origins.

The migration in `src/migrations/20260729101958_old_boomer` is generated but intentionally not applied by the application. Review it, back up the database, and run Drizzle Kit separately with `DIRECT_DATABASE_URL` before deploying. The Vercel build command must remain `pnpm build`; do not prepend `pnpm exec drizzle-kit migrate` to it. Neon recommends the direct endpoint for schema migrations because the pooled endpoint uses PgBouncer transaction pooling.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
