CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS servers_name_trgm_idx ON servers USING gin (lower(name) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS servers_description_trgm_idx ON servers USING gin (lower(description) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tags_slug_trgm_idx ON tags USING gin (lower(slug) gin_trgm_ops);--> statement-breakpoint
CREATE TYPE "notification_job_status" AS ENUM('pending', 'processing', 'sent', 'failed');--> statement-breakpoint
ALTER TYPE "server_verification_method" ADD VALUE 'motd_bedrock';--> statement-breakpoint
CREATE TABLE "media_usage_counters" (
	"period" varchar(7) PRIMARY KEY,
	"stored_bytes" integer DEFAULT 0 NOT NULL,
	"advanced_operations" integer DEFAULT 0 NOT NULL,
	"alerted_70" timestamp with time zone,
	"alerted_85" timestamp with time zone,
	"alerted_95" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_runs" (
	"run_id" varchar(100) PRIMARY KEY,
	"nonce" varchar(128) NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"dedupe_key" varchar(255) NOT NULL UNIQUE,
	"recipient_user_id" text,
	"recipient_email" varchar(320) NOT NULL,
	"template" varchar(80) NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"status" "notification_job_status" DEFAULT 'pending'::"notification_job_status" NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tag_aliases" (
	"alias_slug" varchar(64) PRIMARY KEY,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_verifications" ADD COLUMN "edition" "minecraft_edition" DEFAULT 'java'::"minecraft_edition" NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "availability_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "server_reports" ALTER COLUMN "reporter_user_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "server_verifications_one_pending_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "server_verifications_one_pending_idx" ON "server_verifications" ("server_id","edition") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_jobs_queue_idx" ON "notification_jobs" ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_recipient_user_id_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tag_aliases" ADD CONSTRAINT "tag_aliases_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "moderation_events" DROP CONSTRAINT "moderation_events_actor_user_id_user_id_fkey", ADD CONSTRAINT "moderation_events_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_reports" DROP CONSTRAINT "server_reports_reporter_user_id_user_id_fkey", ADD CONSTRAINT "server_reports_reporter_user_id_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
