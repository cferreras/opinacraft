CREATE TYPE "media_cleanup_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "media_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"blob_key" varchar(512) NOT NULL UNIQUE,
	"status" "media_cleanup_status" DEFAULT 'pending'::"media_cleanup_status" NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "media_cleanup_jobs_queue_idx" ON "media_cleanup_jobs" ("status","next_attempt_at");