CREATE TYPE "moderation_action" AS ENUM('report_created', 'dismissed', 'hidden', 'restored');--> statement-breakpoint
CREATE TYPE "platform_role_name" AS ENUM('moderator', 'admin');--> statement-breakpoint
CREATE TYPE "server_moderation_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "server_report_reason" AS ENUM('inappropriate', 'misleading', 'offline', 'copyright', 'other');--> statement-breakpoint
CREATE TYPE "server_report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"report_id" uuid,
	"actor_user_id" text NOT NULL,
	"action" "moderation_action" NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"user_id" text PRIMARY KEY,
	"role" "platform_role_name" NOT NULL,
	"granted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"reporter_user_id" text NOT NULL,
	"reason" "server_report_reason" NOT NULL,
	"details" text,
	"status" "server_report_status" DEFAULT 'open'::"server_report_status" NOT NULL,
	"assigned_to_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "moderation_status" "server_moderation_status" DEFAULT 'active'::"server_moderation_status" NOT NULL;--> statement-breakpoint
CREATE INDEX "moderation_events_server_created_idx" ON "moderation_events" ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "server_reports_queue_idx" ON "server_reports" ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_reports_one_open_per_user_server_idx" ON "server_reports" ("server_id","reporter_user_id") WHERE "status" = 'open';--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_report_id_server_reports_id_fkey" FOREIGN KEY ("report_id") REFERENCES "server_reports"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_granted_by_user_id_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_reports" ADD CONSTRAINT "server_reports_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_reports" ADD CONSTRAINT "server_reports_reporter_user_id_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "server_reports" ADD CONSTRAINT "server_reports_assigned_to_user_id_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "user"("id") ON DELETE SET NULL;