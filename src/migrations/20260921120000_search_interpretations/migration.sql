-- Natural-language search remembers what a query meant so the same phrase is interpreted once.
-- This is a cache: every row can be deleted at any time and the only cost is one more Jev call.
CREATE TABLE "search_interpretations" (
  "query_hash" varchar(64) PRIMARY KEY,
  "query" varchar(80) NOT NULL,
  "model" varchar(64) NOT NULL,
  "interpretation" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Expired rows are swept by range over this index rather than by scanning the table.
CREATE INDEX "search_interpretations_updated_at_idx" ON "search_interpretations" ("updated_at");
