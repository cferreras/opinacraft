CREATE TYPE "vote_delivery_status" AS ENUM('not_configured', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "votifier_key_type" AS ENUM('token', 'rsa');--> statement-breakpoint
CREATE TABLE "server_monthly_votes" (
	"server_id" uuid,
	"month" varchar(7),
	"votes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_monthly_votes_pkey" PRIMARY KEY("server_id","month"),
	CONSTRAINT "server_monthly_votes_votes_check" CHECK ("votes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "server_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"nickname" varchar(16) NOT NULL,
	"nickname_key" varchar(16) NOT NULL,
	"user_id" text,
	"ip_hash" varchar(64),
	"month" varchar(7) NOT NULL,
	"delivery_status" "vote_delivery_status" DEFAULT 'not_configured'::"vote_delivery_status" NOT NULL,
	"delivery_error" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_votes_nickname_check" CHECK ("nickname" ~ '^[A-Za-z0-9_]{3,16}$'),
	CONSTRAINT "server_votes_month_check" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "server_votifier_settings" (
	"server_id" uuid PRIMARY KEY,
	"host" varchar(253) NOT NULL,
	"port" integer NOT NULL,
	"key_type" "votifier_key_type" NOT NULL,
	"secret_ciphertext" bytea NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_error" varchar(40),
	"last_test_latency_ms" integer,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_votifier_settings_port_check" CHECK ("port" between 1024 and 65535)
);
--> statement-breakpoint
CREATE INDEX "server_monthly_votes_month_votes_idx" ON "server_monthly_votes" ("month","votes");--> statement-breakpoint
CREATE INDEX "server_votes_server_nickname_created_idx" ON "server_votes" ("server_id","nickname_key","created_at");--> statement-breakpoint
CREATE INDEX "server_votes_server_ip_created_idx" ON "server_votes" ("server_id","ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "server_votes_user_server_idx" ON "server_votes" ("user_id","server_id");--> statement-breakpoint
CREATE INDEX "server_votes_server_created_idx" ON "server_votes" ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "server_votes_ip_hash_created_idx" ON "server_votes" ("created_at") WHERE "ip_hash" is not null;--> statement-breakpoint
ALTER TABLE "server_monthly_votes" ADD CONSTRAINT "server_monthly_votes_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_votes" ADD CONSTRAINT "server_votes_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_votes" ADD CONSTRAINT "server_votes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "server_votifier_settings" ADD CONSTRAINT "server_votifier_settings_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_votifier_settings" ADD CONSTRAINT "server_votifier_settings_updated_by_user_id_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;