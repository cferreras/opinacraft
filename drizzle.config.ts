import "dotenv/config";

import { serverEnv } from '@/env/server';
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/schema.ts", "./src/auth-schema.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: serverEnv.DIRECT_DATABASE_URL ?? serverEnv.DATABASE_URL,
  },
});
