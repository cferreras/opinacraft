import "dotenv/config";

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { authRelations } from "./auth-schema";
import { serverEnv } from "./env/server";
import { relations } from "./relations";

const sql = neon(serverEnv.DATABASE_URL);
export const db = drizzle({
  client: sql,
  relations: { ...relations, ...authRelations },
});
