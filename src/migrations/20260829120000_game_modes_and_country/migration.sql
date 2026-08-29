ALTER TABLE "servers"
  ADD COLUMN "country" varchar(8);--> statement-breakpoint

CREATE TABLE "server_game_modes" (
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE cascade,
  "mode" varchar(32) NOT NULL,
  "position" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "server_game_modes_server_id_mode_pk" PRIMARY KEY ("server_id", "mode")
);--> statement-breakpoint

CREATE INDEX "server_game_modes_mode_idx" ON "server_game_modes" ("mode");--> statement-breakpoint

-- Free-text tags are replaced by the closed mode vocabulary in src/lib/servers/game-modes.ts.
-- Nothing is carried over: the tags were owner-written strings with no reliable mapping onto the
-- new list, so servers start with no mode until their owner picks one.
DROP TABLE IF EXISTS "tag_aliases";--> statement-breakpoint
DROP TABLE IF EXISTS "server_tags";--> statement-breakpoint
DROP TABLE IF EXISTS "tags";--> statement-breakpoint
DROP TYPE IF EXISTS "server_tag_status";
