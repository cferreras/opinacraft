CREATE TYPE "server_review_report_reason" AS ENUM('spam', 'harassment', 'offensive', 'false_information', 'conflict_of_interest', 'other');--> statement-breakpoint
CREATE TYPE "server_review_report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "server_review_status" AS ENUM('published', 'hidden', 'deleted');--> statement-breakpoint
CREATE TABLE "review_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"review_id" uuid NOT NULL,
	"user_id" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_replies_content_length_check" CHECK (char_length(btrim("content")) between 10 and 2000)
);
--> statement-breakpoint
CREATE TABLE "server_review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"review_id" uuid,
	"reporter_user_id" text,
	"reason" "server_review_report_reason" NOT NULL,
	"details" text,
	"status" "server_review_report_status" DEFAULT 'open'::"server_review_report_status" NOT NULL,
	"assigned_to_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_review_reports_details_length_check" CHECK ("details" is null or char_length("details") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "server_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"user_id" text,
	"rating" smallint NOT NULL,
	"content" text NOT NULL,
	"status" "server_review_status" DEFAULT 'published'::"server_review_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_reviews_rating_check" CHECK ("rating" between 1 and 5),
	CONSTRAINT "server_reviews_content_length_check" CHECK (char_length(btrim("content")) between 10 and 2000)
);
--> statement-breakpoint
ALTER TABLE "moderation_events" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD COLUMN "review_report_id" uuid;--> statement-breakpoint
CREATE INDEX "moderation_events_review_created_idx" ON "moderation_events" ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_events_review_report_created_idx" ON "moderation_events" ("review_report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_replies_one_per_review_idx" ON "review_replies" ("review_id");--> statement-breakpoint
CREATE INDEX "review_replies_user_id_idx" ON "review_replies" ("user_id");--> statement-breakpoint
CREATE INDEX "server_review_reports_queue_idx" ON "server_review_reports" ("status","created_at");--> statement-breakpoint
CREATE INDEX "server_review_reports_review_idx" ON "server_review_reports" ("review_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "server_review_reports_one_open_per_user_review_idx" ON "server_review_reports" ("review_id","reporter_user_id") WHERE "status" = 'open' and "review_id" is not null and "reporter_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "server_reviews_one_per_user_idx" ON "server_reviews" ("server_id","user_id");--> statement-breakpoint
CREATE INDEX "server_reviews_server_status_created_idx" ON "server_reviews" ("server_id","status","created_at");--> statement-breakpoint
CREATE INDEX "server_reviews_user_id_idx" ON "server_reviews" ("user_id");--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_review_id_server_reviews_id_fkey" FOREIGN KEY ("review_id") REFERENCES "server_reviews"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_review_report_id_server_review_reports_id_fkey" FOREIGN KEY ("review_report_id") REFERENCES "server_review_reports"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_server_reviews_id_fkey" FOREIGN KEY ("review_id") REFERENCES "server_reviews"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_review_reports" ADD CONSTRAINT "server_review_reports_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_review_reports" ADD CONSTRAINT "server_review_reports_review_id_server_reviews_id_fkey" FOREIGN KEY ("review_id") REFERENCES "server_reviews"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_review_reports" ADD CONSTRAINT "server_review_reports_reporter_user_id_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_review_reports" ADD CONSTRAINT "server_review_reports_assigned_to_user_id_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_reviews" ADD CONSTRAINT "server_reviews_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_reviews" ADD CONSTRAINT "server_reviews_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;
