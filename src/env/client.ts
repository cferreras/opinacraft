import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_DISCORD_ENABLED: z.enum(["true", "false"]).default("false"),
    // Public by design: the site key identifies the widget, the secret never leaves the server.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_DISCORD_ENABLED: process.env.NEXT_PUBLIC_DISCORD_ENABLED,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  emptyStringAsUndefined: true,
});
