-- Per-account slice of the shared monthly media operation budget. The global
-- counters in "media_usage_counters" guard provider cost; these rows stop a
-- single account from exhausting the allowance for everyone else.
CREATE TABLE IF NOT EXISTS "media_account_usage" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "period" varchar(7) NOT NULL,
  "advanced_operations" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "window_operations" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_account_usage_user_id_period_pk" PRIMARY KEY ("user_id", "period")
);--> statement-breakpoint

-- Joining a server team withholds the member's own review from public surfaces
-- instead of destroying it, so the change is reversible when they leave.
ALTER TABLE "server_reviews"
  ADD COLUMN IF NOT EXISTS "withheld_at" timestamp with time zone;
