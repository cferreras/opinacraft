CREATE TYPE "server_access_type" AS ENUM('open', 'whitelist');--> statement-breakpoint
CREATE TYPE "server_account_mode" AS ENUM('premium_only', 'premium_and_non_premium');--> statement-breakpoint
CREATE TYPE "server_auth_mode" AS ENUM('direct', 'password_non_premium', 'password_all');--> statement-breakpoint

ALTER TABLE "servers"
  ADD COLUMN "access_type" "server_access_type" DEFAULT 'open' NOT NULL,
  ADD COLUMN "access_form_url" text,
  ADD COLUMN "account_mode" "server_account_mode" DEFAULT 'premium_only' NOT NULL,
  ADD COLUMN "auth_mode" "server_auth_mode" DEFAULT 'direct' NOT NULL;--> statement-breakpoint

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_access_form_url_check"
    CHECK (("access_type" = 'whitelist') OR ("access_form_url" is null)) NOT VALID,
  ADD CONSTRAINT "servers_account_auth_mode_check"
    CHECK (("account_mode" = 'premium_only' AND "auth_mode" = 'direct') OR ("account_mode" = 'premium_and_non_premium' AND "auth_mode" in ('password_non_premium', 'password_all'))) NOT VALID;--> statement-breakpoint

ALTER TABLE "servers"
  VALIDATE CONSTRAINT "servers_access_form_url_check",
  VALIDATE CONSTRAINT "servers_account_auth_mode_check";--> statement-breakpoint
