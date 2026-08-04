CREATE TYPE "server_endpoint_sample_failure" AS ENUM('unreachable', 'timeout', 'invalid_response', 'dns_error', 'blocked_target', 'monitor_error');--> statement-breakpoint
CREATE TABLE "server_endpoint_player_hourly" (
	"server_id" uuid,
	"edition" "minecraft_edition",
	"bucket_start" timestamp with time zone,
	"last_source_id" uuid,
	"source_changed" integer DEFAULT 0 NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"online_count" integer DEFAULT 0 NOT NULL,
	"unknown_count" integer DEFAULT 0 NOT NULL,
	"player_data_count" integer DEFAULT 0 NOT NULL,
	"players_total" bigint DEFAULT 0 NOT NULL,
	"players_peak" integer,
	"capacity_data_count" integer DEFAULT 0 NOT NULL,
	"capacity_total" bigint DEFAULT 0 NOT NULL,
	"capacity_latest" integer,
	"occupancy_data_count" integer DEFAULT 0 NOT NULL,
	"occupancy_basis_points_total" bigint DEFAULT 0 NOT NULL,
	"last_sample_at" timestamp with time zone,
	CONSTRAINT "server_endpoint_player_hourly_pkey" PRIMARY KEY("server_id","edition","bucket_start"),
	CONSTRAINT "server_endpoint_player_hourly_source_changed_check" CHECK ("source_changed" between 0 and 1),
	CONSTRAINT "server_endpoint_player_hourly_counts_check" CHECK ("sample_count" >= 0 and "online_count" >= 0 and "unknown_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "server_endpoint_player_snapshots" (
	"server_id" uuid,
	"edition" "minecraft_edition",
	"history_source_id" uuid NOT NULL,
	"sampled_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "server_endpoint_health" NOT NULL,
	"failure_code" "server_endpoint_sample_failure",
	"players_current" integer,
	"players_max" integer,
	"run_id" varchar(100) NOT NULL,
	CONSTRAINT "server_endpoint_player_snapshots_pkey" PRIMARY KEY("server_id","edition","sampled_at"),
	CONSTRAINT "server_endpoint_player_snapshots_current_check" CHECK ("players_current" is null or "players_current" >= 0),
	CONSTRAINT "server_endpoint_player_snapshots_max_check" CHECK ("players_max" is null or "players_max" >= 0),
	CONSTRAINT "server_endpoint_player_snapshots_status_check" CHECK (("status" = 'online' and "failure_code" is null) or ("status" <> 'online')),
	CONSTRAINT "server_endpoint_player_snapshots_online_players_check" CHECK (("status" = 'online') or ("players_current" is null and "players_max" is null))
);
--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "sampled_at" timestamp with time zone;--> statement-breakpoint
WITH ranked AS (
  SELECT ctid, created_at, row_number() OVER (PARTITION BY created_at ORDER BY run_id) - 1 AS ordinal
  FROM "monitor_runs"
  WHERE "sampled_at" IS NULL
)
UPDATE "monitor_runs" AS runs
SET "sampled_at" = ranked.created_at + (ranked.ordinal * interval '1 microsecond')
FROM ranked
WHERE runs.ctid = ranked.ctid;--> statement-breakpoint
ALTER TABLE "monitor_runs" ALTER COLUMN "sampled_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "java_persistence_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_runs" ADD COLUMN "bedrock_persistence_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD COLUMN "history_source_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_runs_sampled_at_key" ON "monitor_runs" ("sampled_at");--> statement-breakpoint
CREATE INDEX "server_endpoint_player_hourly_server_bucket_idx" ON "server_endpoint_player_hourly" ("server_id","bucket_start");--> statement-breakpoint
CREATE INDEX "server_endpoint_player_snapshots_server_sampled_idx" ON "server_endpoint_player_snapshots" ("server_id","sampled_at");--> statement-breakpoint
CREATE INDEX "server_endpoint_player_snapshots_sampled_brin_idx" ON "server_endpoint_player_snapshots" USING brin ("sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_endpoints_history_source_id_key" ON "server_endpoints" ("history_source_id");--> statement-breakpoint
CREATE INDEX "server_endpoint_player_hourly_bucket_brin_idx" ON "server_endpoint_player_hourly" USING brin ("bucket_start");--> statement-breakpoint
ALTER TABLE "server_endpoint_player_hourly" ADD CONSTRAINT "server_endpoint_player_hourly_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_endpoint_player_snapshots" ADD CONSTRAINT "server_endpoint_player_snapshots_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;
