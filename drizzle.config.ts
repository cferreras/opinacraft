import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;

if (!directDatabaseUrl) {
  throw new Error(
    "DIRECT_DATABASE_URL is required for Drizzle migrations. Do not use DATABASE_URL (pooled) for schema changes.",
  );
}

const parsedDirectDatabaseUrl = new URL(directDatabaseUrl);
if (!["postgres:", "postgresql:"].includes(parsedDirectDatabaseUrl.protocol)) {
  throw new Error("DIRECT_DATABASE_URL must use the postgres or postgresql protocol.");
}
if (/-pooler(?:\.|$)/i.test(parsedDirectDatabaseUrl.hostname)) {
  throw new Error("DIRECT_DATABASE_URL must be a direct, non-pooled connection.");
}

export default defineConfig({
  schema: ["./src/schema.ts", "./src/auth-schema.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: directDatabaseUrl,
  },
});
