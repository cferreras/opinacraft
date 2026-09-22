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
    // Natural-language search. Everything here is optional: with no key the search box keeps
    // working and simply never reaches Jev.
    TYPESAFE_API_KEY: z.string().min(1).optional(),
    JEV_SEARCH_ENABLED: z.enum(["true", "false"]).default("false"),
    JEV_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(5000),
    JEV_TIMEOUT_MS: z.coerce.number().int().positive().max(10_000).default(2000),
    JEV_CACHE_TTL_HOURS: z.coerce.number().int().positive().max(720).default(72),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    AI_SEARCH_SESSION_SECRET: z.string().min(32).optional(),
    AI_SEARCH_SESSION_QUOTA: z.coerce.number().int().positive().default(20),
    // Per-server judging. Off by default and gated separately from the facet reading, because one
    // of these searches is one request per visible server rather than one per search — measured at
    // ~462 input tokens and ~300ms each, so a catalog of 300 costs roughly $0.006 and five seconds.
    SEMANTIC_SEARCH_ENABLED: z.enum(["true", "false"]).default("false"),
    // Counted in requests, not in searches: at 300 servers a single search spends 300 of these, so
    // this default is about a hundred novel searches a day before the road closes.
    SEMANTIC_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(30_000),
    // What one visitor may spend per session, also in requests. Three novel searches at 300 servers.
    SEMANTIC_SESSION_REQUEST_QUOTA: z.coerce.number().int().positive().default(900),
    // Novel searches per minute from one address. The facet route allows 30 interpretations a
    // minute; at 300 requests each that would be 9,000 inference calls a minute from one visitor,
    // so this road needs its own, far tighter, ceiling.
    SEMANTIC_SEARCHES_PER_MINUTE: z.coerce.number().int().positive().default(4),
    SEMANTIC_SEARCHES_PER_HOUR: z.coerce.number().int().positive().default(30),
    // Per request, not per search. The whole search is bounded by SEMANTIC_DEADLINE_MS instead.
    SEMANTIC_TIMEOUT_MS: z.coerce.number().int().positive().max(20_000).default(4000),
    // The wall the whole search runs into: whatever has been scored by then is what gets ranked.
    SEMANTIC_DEADLINE_MS: z.coerce.number().int().positive().max(60_000).default(12_000),
    SEMANTIC_CONCURRENCY: z.coerce.number().int().positive().max(64).default(32),
    // The 0.5 measured as sensible for explicit queries; retune against real ones, not by taste.
    SEMANTIC_SHOW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
    // How sure the router must be before a search is allowed to spend all that.
    SEMANTIC_ROUTE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
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
