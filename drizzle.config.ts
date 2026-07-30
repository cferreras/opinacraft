import "dotenv/config";

import { serverEnv } from '@/env/server';
import { defineConfig } from "drizzle-kit";

if (!serverEnv.DIRECT_DATABASE_URL) {
  throw new Error(
    "DIRECT_DATABASE_URL is required for Drizzle migrations. Do not use DATABASE_URL (pooled) for schema changes.",
  );
}

export default defineConfig({
  schema: ["./src/schema.ts", "./src/auth-schema.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: serverEnv.DIRECT_DATABASE_URL,
  },
});
