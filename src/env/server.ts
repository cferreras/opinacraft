import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    DIRECT_DATABASE_URL: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    // Public origin for canonicals, the sitemap and Open Graph. Defaults to BETTER_AUTH_URL,
    // normalised to the host that answers 200 (see src/lib/seo/site-url.ts).
    SITE_URL: z.url().optional(),
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    SERVER_VERIFICATION_SECRET: z.string().min(32).optional(),
    // Encrypts owners' Votifier tokens and public keys at rest; vote delivery is off without it.
    VOTIFIER_SECRET: z.string().min(32).optional(),
    // Development only: lets the owner panel and vote delivery reach a Votifier on localhost or the
    // LAN. Ignored whenever NODE_ENV is production, so it can never open the SSRF guard in a deploy.
    VOTIFIER_ALLOW_PRIVATE_HOSTS: z.enum(["true", "false"]).default("false"),
    CRON_MONITOR_SECRET: z.string().min(32).optional(),
    MONITOR_API_URL: z.url().optional(),
    MONITOR_API_SECRET: z.string().min(32).optional(),
    MONITOR_DATABASE_URL: z.url().optional(),
    MONITOR_DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    MONITOR_API_PORT: z.coerce.number().int().positive().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    E2E_DISABLE_EMAIL: z.enum(["true", "false"]).default("false"),
    E2E_MEDIA_STORAGE: z.enum(["memory", "blob"]).default("blob"),
    BLOB_OPERATOR_EMAIL: z.email().optional(),
    DISCORD_CLIENT_ID: z.string().min(1).optional(),
    DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
    // Cloudflare Turnstile, the anti-bot check on the vote page. Optional outside production.
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  },
  // If you're using Next.js < 13.4.4, you'll need to specify the runtimeEnv manually
  // runtimeEnv: {
  //   DATABASE_URL: process.env.DATABASE_URL,
  //   OPEN_AI_API_KEY: process.env.OPEN_AI_API_KEY,
  // },
  // For Next.js >= 13.4.4, you can just reference process.env:
  experimental__runtimeEnv: process.env,
  // The monitor is disabled until its authorization secret is configured.
  // Keep this optional so deployments that do not use the monitor can build.
  emptyStringAsUndefined: true,
});
