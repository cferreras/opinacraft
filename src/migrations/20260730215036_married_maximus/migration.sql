CREATE TYPE "server_endpoint_health" AS ENUM('unknown', 'online', 'offline');--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "health_status" "server_endpoint_health" DEFAULT 'unknown'::"server_endpoint_health" NOT NULL;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "players_current" integer;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "players_max" integer;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "version" varchar(100);--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "last_online_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "consecutive_failures" smallint DEFAULT 0 NOT NULL;