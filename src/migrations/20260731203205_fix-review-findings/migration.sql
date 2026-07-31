ALTER TABLE "monitor_runs" ADD COLUMN "fallback_endpoints" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_usage_counters" ALTER COLUMN "stored_bytes" SET DATA TYPE bigint USING "stored_bytes"::bigint;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_alias_of_tags_id_fkey" FOREIGN KEY ("alias_of") REFERENCES "tags"("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
INSERT INTO "media_usage_counters" ("period", "stored_bytes")
SELECT 'total', COALESCE(SUM("bytes"), 0)::bigint
FROM "server_media"
WHERE "status" IN ('pending', 'active', 'deleted')
ON CONFLICT ("period") DO NOTHING;
