CREATE TYPE "server_verification_attempt_status" AS ENUM('pending', 'verified', 'failed', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "server_verification_failure_code" AS ENUM('offline', 'timeout', 'invalid_response', 'code_not_found', 'blocked_target', 'endpoint_changed');--> statement-breakpoint
CREATE TYPE "server_verification_method" AS ENUM('motd_java');--> statement-breakpoint
CREATE TYPE "server_verification_status" AS ENUM('unverified', 'verified');--> statement-breakpoint
ALTER TYPE "server_publication_status" ADD VALUE 'hidden';--> statement-breakpoint
CREATE TABLE "server_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"server_id" uuid NOT NULL,
	"requested_by_user_id" text,
	"method" "server_verification_method" DEFAULT 'motd_java'::"server_verification_method" NOT NULL,
	"endpoint_host" varchar(253) NOT NULL,
	"endpoint_port" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"token_ciphertext" bytea NOT NULL,
	"status" "server_verification_attempt_status" DEFAULT 'pending'::"server_verification_attempt_status" NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"last_failure_code" "server_verification_failure_code",
	"last_attempt_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_verifications_endpoint_port_check" CHECK ("endpoint_port" between 1024 and 65535),
	CONSTRAINT "server_verifications_attempt_count_check" CHECK ("attempt_count" between 0 and 5),
	CONSTRAINT "server_verifications_expiry_check" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "server_verifications_verified_at_check" CHECK (("status" = 'verified') = ("verified_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "verification_status" "server_verification_status" DEFAULT 'unverified'::"server_verification_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "publication_status" SET DEFAULT 'draft'::"server_publication_status";--> statement-breakpoint
CREATE INDEX "server_verifications_server_created_idx" ON "server_verifications" ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "server_verifications_requester_created_idx" ON "server_verifications" ("server_id","requested_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_verifications_one_pending_idx" ON "server_verifications" ("server_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "servers_publication_verification_idx" ON "servers" ("publication_status","verification_status");--> statement-breakpoint
ALTER TABLE "server_verifications" ADD CONSTRAINT "server_verifications_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_verifications" ADD CONSTRAINT "server_verifications_requested_by_user_id_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_verified_at_check" CHECK (("verification_status" = 'verified') = ("verified_at" is not null));