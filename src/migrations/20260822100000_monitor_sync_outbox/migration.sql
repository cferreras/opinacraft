CREATE TABLE IF NOT EXISTS "server_monitor_sync_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dedupe_key" varchar(255) NOT NULL UNIQUE,
  "server_id" uuid NOT NULL,
  "operation" varchar(20) NOT NULL CHECK ("operation" in ('upsert', 'delete')),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" in ('pending', 'processing', 'done', 'failed')),
  "attempts" smallint NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "server_monitor_sync_outbox_queue_idx" ON "server_monitor_sync_outbox" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "server_monitor_sync_outbox_server_idx" ON "server_monitor_sync_outbox" ("server_id");
