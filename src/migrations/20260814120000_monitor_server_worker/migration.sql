CREATE TYPE "monitor_job_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint

ALTER TABLE "servers"
  ADD COLUMN "monitor_health_status" "server_endpoint_health" DEFAULT 'unknown' NOT NULL,
  ADD COLUMN "monitor_players_current" integer,
  ADD COLUMN "monitor_players_max" integer,
  ADD COLUMN "monitor_version" varchar(100),
  ADD COLUMN "monitor_latency_ms" integer,
  ADD COLUMN "monitor_last_checked_at" timestamp with time zone,
  ADD COLUMN "monitor_last_online_at" timestamp with time zone,
  ADD COLUMN "monitor_consecutive_failures" smallint DEFAULT 0 NOT NULL,
  ADD COLUMN "monitor_probe_edition" "minecraft_edition";--> statement-breakpoint

CREATE TABLE "server_network_targets" (
  "server_id" uuid PRIMARY KEY NOT NULL,
  "host" varchar(253) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "server_network_targets_server_id_servers_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade
);--> statement-breakpoint

INSERT INTO "server_network_targets" ("server_id", "host")
SELECT DISTINCT ON ("server_id") "server_id", "host"
FROM "server_endpoints"
ORDER BY "server_id", CASE WHEN "edition" = 'java' THEN 0 ELSE 1 END, "updated_at" DESC;--> statement-breakpoint

WITH mismatched AS (
  SELECT e."server_id"
  FROM "server_endpoints" e
  INNER JOIN "server_network_targets" t ON t."server_id" = e."server_id"
  WHERE e."host" <> t."host"
  GROUP BY e."server_id"
)
UPDATE "servers"
SET "verification_status" = 'unverified', "verified_at" = NULL
WHERE "id" IN (SELECT "server_id" FROM mismatched);--> statement-breakpoint

UPDATE "server_endpoints" e
SET
  "host" = t."host",
  "verification_status" = CASE WHEN e."host" <> t."host" THEN 'unverified' ELSE e."verification_status" END,
  "health_status" = CASE WHEN e."host" <> t."host" THEN 'unknown' ELSE e."health_status" END,
  "players_current" = CASE WHEN e."host" <> t."host" THEN NULL ELSE e."players_current" END,
  "players_max" = CASE WHEN e."host" <> t."host" THEN NULL ELSE e."players_max" END,
  "version" = CASE WHEN e."host" <> t."host" THEN NULL ELSE e."version" END,
  "latency_ms" = CASE WHEN e."host" <> t."host" THEN NULL ELSE e."latency_ms" END,
  "last_checked_at" = CASE WHEN e."host" <> t."host" THEN NULL ELSE e."last_checked_at" END,
  "last_online_at" = CASE WHEN e."host" <> t."host" THEN NULL ELSE e."last_online_at" END,
  "consecutive_failures" = CASE WHEN e."host" <> t."host" THEN 0 ELSE e."consecutive_failures" END
FROM "server_network_targets" t
WHERE t."server_id" = e."server_id";--> statement-breakpoint

WITH canonical AS (
  SELECT DISTINCT ON (e."server_id")
    e."server_id",
    e."edition",
    e."health_status",
    e."players_current",
    e."players_max",
    e."version",
    e."latency_ms",
    e."last_checked_at",
    e."last_online_at",
    e."consecutive_failures"
  FROM "server_endpoints" e
  WHERE e."verification_status" = 'verified'
  ORDER BY e."server_id", CASE WHEN e."edition" = 'java' THEN 0 ELSE 1 END
)
UPDATE "servers" s
SET
  "monitor_health_status" = c."health_status",
  "monitor_players_current" = c."players_current",
  "monitor_players_max" = c."players_max",
  "monitor_version" = c."version",
  "monitor_latency_ms" = c."latency_ms",
  "monitor_last_checked_at" = c."last_checked_at",
  "monitor_last_online_at" = c."last_online_at",
  "monitor_consecutive_failures" = c."consecutive_failures",
  "monitor_probe_edition" = c."edition"
FROM canonical c
WHERE s."id" = c."server_id";--> statement-breakpoint

UPDATE "server_verifications" v
SET "status" = 'superseded'
FROM "server_network_targets" t
WHERE v."server_id" = t."server_id"
  AND v."status" = 'pending'
  AND v."endpoint_host" <> t."host";--> statement-breakpoint

CREATE TABLE "server_monitor_schedules" (
  "server_id" uuid PRIMARY KEY NOT NULL,
  "cadence_minutes" smallint NOT NULL,
  "next_due_at" timestamp with time zone NOT NULL,
  "last_scheduled_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "server_monitor_schedules_server_id_servers_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade,
  CONSTRAINT "server_monitor_schedules_cadence_check" CHECK ("cadence_minutes" in (15, 60))
);--> statement-breakpoint
CREATE INDEX "server_monitor_schedules_due_idx" ON "server_monitor_schedules" ("next_due_at", "server_id");--> statement-breakpoint

CREATE TABLE "server_monitor_schedule_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "server_id" uuid NOT NULL,
  "cadence_minutes" smallint NOT NULL,
  "effective_from" timestamp with time zone NOT NULL,
  "effective_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "server_monitor_schedule_history_server_id_servers_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade,
  CONSTRAINT "server_monitor_schedule_history_cadence_check" CHECK ("cadence_minutes" in (15, 60))
);--> statement-breakpoint
CREATE INDEX "server_monitor_schedule_history_lookup_idx" ON "server_monitor_schedule_history" ("server_id", "effective_from");--> statement-breakpoint

CREATE TABLE "server_monitor_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "server_id" uuid NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" "monitor_job_status" DEFAULT 'pending' NOT NULL,
  "attempts" smallint DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" varchar(120),
  "lease_until" timestamp with time zone,
  "last_error" text,
  "processing_started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "observed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "server_monitor_jobs_server_id_servers_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX "server_monitor_jobs_server_scheduled_key" ON "server_monitor_jobs" ("server_id", "scheduled_at");--> statement-breakpoint
CREATE INDEX "server_monitor_jobs_queue_idx" ON "server_monitor_jobs" ("status", "next_attempt_at", "scheduled_at");--> statement-breakpoint
CREATE INDEX "server_monitor_jobs_lease_idx" ON "server_monitor_jobs" ("lease_until");--> statement-breakpoint

CREATE TABLE "server_player_snapshots" (
  "server_id" uuid NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "probe_edition" "minecraft_edition",
  "status" "server_endpoint_health" NOT NULL,
  "failure_code" "server_endpoint_sample_failure",
  "players_current" integer,
  "players_max" integer,
  "version" varchar(100),
  "latency_ms" integer,
  "job_id" uuid,
  CONSTRAINT "server_player_snapshots_pkey" PRIMARY KEY ("server_id", "scheduled_at"),
  CONSTRAINT "server_player_snapshots_server_id_servers_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade,
  CONSTRAINT "server_player_snapshots_job_id_server_monitor_jobs_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "server_monitor_jobs"("id") ON DELETE set null,
  CONSTRAINT "server_player_snapshots_current_check" CHECK ("players_current" is null or "players_current" >= 0),
  CONSTRAINT "server_player_snapshots_max_check" CHECK ("players_max" is null or "players_max" >= 0),
  CONSTRAINT "server_player_snapshots_status_check" CHECK (("status" = 'online' and "failure_code" is null) or ("status" <> 'online')),
  CONSTRAINT "server_player_snapshots_online_players_check" CHECK (("status" = 'online') or ("players_current" is null and "players_max" is null))
);--> statement-breakpoint
CREATE INDEX "server_player_snapshots_server_observed_idx" ON "server_player_snapshots" ("server_id", "observed_at");--> statement-breakpoint

CREATE TABLE "server_player_hourly" (
  "server_id" uuid NOT NULL,
  "bucket_start" timestamp with time zone NOT NULL,
  "last_probe_edition" "minecraft_edition",
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
  "last_observed_at" timestamp with time zone,
  CONSTRAINT "server_player_hourly_pkey" PRIMARY KEY ("server_id", "bucket_start"),
  CONSTRAINT "server_player_hourly_server_id_servers_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade,
  CONSTRAINT "server_player_hourly_source_changed_check" CHECK ("source_changed" between 0 and 1),
  CONSTRAINT "server_player_hourly_counts_check" CHECK ("sample_count" >= 0 and "online_count" >= 0 and "unknown_count" >= 0)
);--> statement-breakpoint
CREATE INDEX "server_player_hourly_server_bucket_idx" ON "server_player_hourly" ("server_id", "bucket_start");--> statement-breakpoint

INSERT INTO "server_monitor_schedules" ("server_id", "cadence_minutes", "next_due_at")
SELECT s."id",
  CASE WHEN s."publication_status" = 'published' AND s."moderation_status" = 'active' AND s."availability_hidden_at" IS NULL THEN 15 ELSE 60 END,
  now()
FROM "servers" s
WHERE EXISTS (
  SELECT 1 FROM "server_endpoints" e
  WHERE e."server_id" = s."id" AND e."verification_status" = 'verified'
);--> statement-breakpoint

INSERT INTO "server_monitor_schedule_history" ("server_id", "cadence_minutes", "effective_from")
SELECT "server_id", "cadence_minutes", now()
FROM "server_monitor_schedules";--> statement-breakpoint

INSERT INTO "server_player_snapshots" ("server_id", "scheduled_at", "observed_at", "status", "players_current", "players_max")
SELECT
  s."server_id",
  s."sampled_at",
  max(s."recorded_at"),
  CASE WHEN bool_or(s."status" = 'online') THEN 'online'::server_endpoint_health
       WHEN bool_and(s."status" = 'offline') THEN 'offline'::server_endpoint_health
       ELSE 'unknown'::server_endpoint_health END,
  max(s."players_current") FILTER (WHERE s."status" = 'online'),
  max(s."players_max") FILTER (WHERE s."status" = 'online')
FROM "server_endpoint_player_snapshots" s
GROUP BY s."server_id", s."sampled_at";--> statement-breakpoint

INSERT INTO "server_player_hourly" ("server_id", "bucket_start", "last_probe_edition", "source_changed", "sample_count", "online_count", "unknown_count", "player_data_count", "players_total", "players_peak", "capacity_data_count", "capacity_total", "capacity_latest", "occupancy_data_count", "occupancy_basis_points_total", "last_observed_at")
WITH ranked AS (
  SELECT
    h.*,
    row_number() OVER (
      PARTITION BY h."server_id", h."bucket_start"
      ORDER BY CASE WHEN h."edition" = 'java' THEN 0 ELSE 1 END,
               h."last_sample_at" DESC NULLS LAST,
               h."edition"
    ) AS row_number
  FROM "server_endpoint_player_hourly" h
), canonical AS (
  SELECT * FROM ranked WHERE row_number = 1
), interval_maxima AS (
  SELECT
    h."server_id",
    h."bucket_start",
    max(h."players_peak") AS "players_peak",
    max(h."capacity_latest") AS "capacity_latest"
  FROM "server_endpoint_player_hourly" h
  GROUP BY h."server_id", h."bucket_start"
)
SELECT
  c."server_id",
  c."bucket_start",
  c."edition",
  c."source_changed",
  c."sample_count",
  c."online_count",
  c."unknown_count",
  c."player_data_count",
  c."players_total",
  CASE WHEN c."players_peak" IS NULL THEN m."players_peak"
       WHEN m."players_peak" IS NULL THEN c."players_peak"
       ELSE greatest(c."players_peak", m."players_peak") END,
  c."capacity_data_count",
  c."capacity_total",
  CASE WHEN c."capacity_latest" IS NULL THEN m."capacity_latest"
       WHEN m."capacity_latest" IS NULL THEN c."capacity_latest"
       ELSE greatest(c."capacity_latest", m."capacity_latest") END,
  c."occupancy_data_count",
  c."occupancy_basis_points_total",
  c."last_sample_at"
FROM canonical c
INNER JOIN interval_maxima m
  ON m."server_id" = c."server_id"
 AND m."bucket_start" = c."bucket_start";--> statement-breakpoint

INSERT INTO "server_player_hourly" ("server_id", "bucket_start", "source_changed", "sample_count", "online_count", "unknown_count", "player_data_count", "players_total", "players_peak", "capacity_data_count", "capacity_total", "capacity_latest", "occupancy_data_count", "occupancy_basis_points_total", "last_observed_at")
SELECT
  s."server_id",
  date_trunc('hour', s."scheduled_at"),
  0,
  count(*)::int,
  count(*) FILTER (WHERE s."status" = 'online')::int,
  count(*) FILTER (WHERE s."status" = 'unknown')::int,
  count(*) FILTER (WHERE s."players_current" IS NOT NULL)::int,
  coalesce(sum(s."players_current"), 0),
  max(s."players_current"),
  count(*) FILTER (WHERE s."players_max" IS NOT NULL)::int,
  coalesce(sum(s."players_max"), 0),
  max(s."players_max"),
  count(*) FILTER (WHERE s."players_current" IS NOT NULL AND s."players_max" IS NOT NULL AND s."players_max" > 0)::int,
  coalesce(sum(CASE WHEN s."players_current" IS NOT NULL AND s."players_max" IS NOT NULL AND s."players_max" > 0 THEN round((s."players_current"::numeric / s."players_max") * 10000) ELSE 0 END), 0)::bigint,
  max(s."observed_at")
FROM "server_player_snapshots" s
WHERE NOT EXISTS (
  SELECT 1
  FROM "server_player_hourly" h
  WHERE h."server_id" = s."server_id"
    AND h."bucket_start" = date_trunc('hour', s."scheduled_at")
)
GROUP BY s."server_id", date_trunc('hour', s."scheduled_at");
