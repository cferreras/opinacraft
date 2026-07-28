import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const clientEnv = createEnv({
  client: {
    NEXT_PUBLIC_DISCORD_ENABLED: z.enum(["true", "false"]).default("false"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_DISCORD_ENABLED: process.env.NEXT_PUBLIC_DISCORD_ENABLED,
  },
  emptyStringAsUndefined: true,
});
