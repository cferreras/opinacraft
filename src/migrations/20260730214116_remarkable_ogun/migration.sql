CREATE TYPE "server_media_kind" AS ENUM('logo', 'banner');--> statement-breakpoint
CREATE TYPE "server_media_status" AS ENUM('pending', 'active', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "server_tag_status" AS ENUM('active', 'blocked', 'merged');--> statement-breakpoint
CREATE TABLE "server_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"kind" "server_media_kind" NOT NULL,
	"blob_key" varchar(512) NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"status" "server_media_status" DEFAULT 'pending'::"server_media_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_tags" (
	"server_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_tags_pkey" PRIMARY KEY("server_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"label" varchar(40) NOT NULL,
	"slug" varchar(64) NOT NULL UNIQUE,
	"status" "server_tag_status" DEFAULT 'active'::"server_tag_status" NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"alias_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "server_media_server_kind_idx" ON "server_media" ("server_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "server_media_one_active_kind_idx" ON "server_media" ("server_id","kind") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "server_tags_tag_id_idx" ON "server_tags" ("tag_id");--> statement-breakpoint
CREATE INDEX "tags_active_slug_idx" ON "tags" ("status","slug");--> statement-breakpoint
CREATE INDEX "tags_usage_count_idx" ON "tags" ("status","usage_count");--> statement-breakpoint
ALTER TABLE "server_media" ADD CONSTRAINT "server_media_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_tags" ADD CONSTRAINT "server_tags_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_tags" ADD CONSTRAINT "server_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT;
