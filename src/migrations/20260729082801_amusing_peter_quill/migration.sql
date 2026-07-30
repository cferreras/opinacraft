CREATE TYPE "minecraft_edition" AS ENUM('java', 'bedrock');--> statement-breakpoint
CREATE TYPE "server_member_role" AS ENUM('owner', 'admin', 'editor');--> statement-breakpoint
CREATE TYPE "server_publication_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "server_endpoints" (
	"server_id" uuid,
	"edition" "minecraft_edition",
	"host" varchar(253) NOT NULL,
	"port" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_endpoints_pkey" PRIMARY KEY("server_id","edition"),
	CONSTRAINT "server_endpoints_edition_host_port_key" UNIQUE("edition","host","port"),
	CONSTRAINT "server_endpoints_port_check" CHECK ("port" between 1 and 65535)
);
--> statement-breakpoint
CREATE TABLE "server_members" (
	"server_id" uuid,
	"user_id" text,
	"role" "server_member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_members_pkey" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(80) NOT NULL,
	"slug" varchar(120) NOT NULL UNIQUE,
	"description" text,
	"website_url" text,
	"discord_url" text,
	"publication_status" "server_publication_status" DEFAULT 'published'::"server_publication_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "server_members_user_id_idx" ON "server_members" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_members_one_owner_idx" ON "server_members" ("server_id") WHERE "role" = 'owner';--> statement-breakpoint
ALTER TABLE "server_endpoints" ADD CONSTRAINT "server_endpoints_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_server_id_servers_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_server_owner_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_server_id uuid;
  owner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'servers' THEN
    target_server_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_server_id := OLD.server_id;
  ELSIF TG_OP = 'INSERT' THEN
    target_server_id := NEW.server_id;
  ELSE
    target_server_id := COALESCE(NEW.server_id, OLD.server_id);
  END IF;

  IF EXISTS (SELECT 1 FROM "servers" WHERE id = target_server_id) THEN
    SELECT count(*)
    INTO owner_count
    FROM "server_members"
    WHERE server_id = target_server_id
      AND role = 'owner';

    IF owner_count <> 1 THEN
      RAISE EXCEPTION 'A server must have exactly one owner'
        USING ERRCODE = '23514',
              CONSTRAINT = 'server_members_owner_invariant';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER servers_owner_invariant_trigger
AFTER INSERT ON "servers"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_server_owner_invariant();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER server_members_owner_invariant_trigger
AFTER INSERT OR DELETE OR UPDATE OF server_id, role ON "server_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_server_owner_invariant();
