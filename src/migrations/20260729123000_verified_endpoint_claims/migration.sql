ALTER TABLE "server_endpoints" ADD COLUMN "verification_status" "server_verification_status" DEFAULT 'unverified'::"server_verification_status" NOT NULL;--> statement-breakpoint
UPDATE "server_endpoints" AS endpoint
SET "verification_status" = 'verified'::"server_verification_status"
FROM "servers" AS server
WHERE endpoint."server_id" = server."id"
  AND server."verification_status" = 'verified'::"server_verification_status";--> statement-breakpoint
ALTER TABLE "server_endpoints" DROP CONSTRAINT "server_endpoints_edition_host_port_key";--> statement-breakpoint
ALTER TABLE "server_endpoints" DROP CONSTRAINT "server_endpoints_port_check";--> statement-breakpoint
ALTER TABLE "server_endpoints"
  ADD CONSTRAINT "server_endpoints_port_check"
  CHECK ("port" between 1024 and 65535);--> statement-breakpoint
CREATE UNIQUE INDEX "server_endpoints_verified_edition_host_port_key"
  ON "server_endpoints" ("edition", "host", "port")
  WHERE "verification_status" = 'verified';
