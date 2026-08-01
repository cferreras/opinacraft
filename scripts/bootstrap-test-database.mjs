import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationUrls = new Set(
  [process.env.DATABASE_URL, process.env.DIRECT_DATABASE_URL].filter(Boolean),
);

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required to prepare integration tests.");
}

if (applicationUrls.has(testDatabaseUrl)) {
  throw new Error(
    "Refusing to prepare the integration schema because TEST_DATABASE_URL matches an application database URL.",
  );
}

const pool = new Pool({
  connectionString: testDatabaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

async function ensureEnum(client, name, values) {
  const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
  await client.query(`
    DO $do$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = '${name}'
      ) THEN
        CREATE TYPE "${name}" AS ENUM(${literals});
      END IF;
    END
    $do$;
  `);
}

async function addEnumValue(client, name, value) {
  await client.query(`ALTER TYPE "${name}" ADD VALUE IF NOT EXISTS '${value}'`);
}

async function addColumn(client, table, definition) {
  await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS ${definition}`);
}

async function createIndex(client, statement) {
  await client.query(statement);
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "select current_database() as database, current_user as user_name",
    );
    console.log(`Preparing dedicated integration database ${rows[0].database} (${rows[0].user_name})`);

    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    await ensureEnum(client, "server_endpoint_health", ["unknown", "online", "offline"]);
    await ensureEnum(client, "server_tag_status", ["active", "blocked", "merged"]);
    await ensureEnum(client, "server_media_kind", ["logo", "banner"]);
    await ensureEnum(client, "server_media_status", ["pending", "active", "failed", "deleted"]);
    await ensureEnum(client, "platform_role_name", ["moderator", "admin"]);
    await ensureEnum(client, "server_report_reason", [
      "inappropriate",
      "misleading",
      "offline",
      "copyright",
      "other",
    ]);
    await ensureEnum(client, "server_report_status", ["open", "dismissed", "actioned"]);
    await ensureEnum(client, "server_review_status", ["published", "hidden", "deleted"]);
    await ensureEnum(client, "server_review_report_reason", [
      "spam",
      "harassment",
      "offensive",
      "false_information",
      "conflict_of_interest",
      "other",
    ]);
    await ensureEnum(client, "server_review_report_status", ["open", "dismissed", "actioned"]);
    await ensureEnum(client, "moderation_action", ["report_created", "dismissed", "hidden", "restored"]);
    await ensureEnum(client, "server_moderation_status", ["active", "blocked"]);
    await ensureEnum(client, "media_cleanup_status", ["pending", "processing", "done", "failed"]);
    await ensureEnum(client, "notification_job_status", ["pending", "processing", "sent", "failed"]);
    await addEnumValue(client, "server_verification_method", "motd_bedrock");
    await addEnumValue(client, "server_publication_status", "hidden");

    await addColumn(
      client,
      "servers",
      '"moderation_status" "server_moderation_status" DEFAULT \'active\'::"server_moderation_status" NOT NULL',
    );
    await addColumn(client, "servers", '"availability_hidden_at" timestamp with time zone');

    await addColumn(
      client,
      "server_endpoints",
      '"verification_status" "server_verification_status" DEFAULT \'unverified\'::"server_verification_status" NOT NULL',
    );
    await addColumn(
      client,
      "server_endpoints",
      '"health_status" "server_endpoint_health" DEFAULT \'unknown\'::"server_endpoint_health" NOT NULL',
    );
    await addColumn(client, "server_endpoints", '"players_current" integer');
    await addColumn(client, "server_endpoints", '"players_max" integer');
    await addColumn(client, "server_endpoints", '"version" varchar(100)');
    await addColumn(client, "server_endpoints", '"latency_ms" integer');
    await addColumn(client, "server_endpoints", '"last_checked_at" timestamp with time zone');
    await addColumn(client, "server_endpoints", '"last_online_at" timestamp with time zone');
    await addColumn(
      client,
      "server_endpoints",
      '"consecutive_failures" smallint DEFAULT 0 NOT NULL',
    );

    await addColumn(
      client,
      "server_verifications",
      '"edition" "minecraft_edition" DEFAULT \'java\'::"minecraft_edition" NOT NULL',
    );

    // The first test schema enforced uniqueness for every endpoint, while the
    // current contract only reserves verified endpoints. Keep the bootstrap
    // additive and remove just those obsolete constraints.
    await client.query('ALTER TABLE "server_endpoints" DROP CONSTRAINT IF EXISTS "server_endpoints_edition_host_port_key"');
    await client.query('ALTER TABLE "server_endpoints" DROP CONSTRAINT IF EXISTS "server_endpoints_port_check"');
    await client.query('DROP INDEX IF EXISTS "server_endpoints_edition_host_port_key"');
    await client.query(`
      DO $do$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'server_endpoints'::regclass
            AND conname = 'server_endpoints_port_check'
        ) THEN
          ALTER TABLE "server_endpoints"
            ADD CONSTRAINT "server_endpoints_port_check"
            CHECK ("port" between 1024 and 65535) NOT VALID;
        END IF;
      END
      $do$;
    `);

    // The legacy test database used one pending verification per server. Replace
    // that index with the current per-edition invariant without touching data.
    await client.query('DROP INDEX IF EXISTS "server_verifications_one_pending_idx"');
    await createIndex(
      client,
      'CREATE UNIQUE INDEX IF NOT EXISTS "server_verifications_one_pending_idx" ON "server_verifications" ("server_id", "edition") WHERE "status" = \'pending\'',
    );
    await createIndex(
      client,
      'CREATE UNIQUE INDEX IF NOT EXISTS "server_endpoints_verified_edition_host_port_key" ON "server_endpoints" ("edition", "host", "port") WHERE "verification_status" = \'verified\'',
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS "tags" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "label" varchar(40) NOT NULL,
        "slug" varchar(64) NOT NULL UNIQUE,
        "status" "server_tag_status" DEFAULT 'active'::"server_tag_status" NOT NULL,
        "usage_count" integer DEFAULT 0 NOT NULL,
        "alias_of" uuid,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "server_tags" (
        "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
        "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE RESTRICT,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY ("server_id", "tag_id")
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "tag_aliases" (
        "alias_slug" varchar(64) PRIMARY KEY,
        "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_tags_tag_id_idx" ON "server_tags" ("tag_id")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "tags_active_slug_idx" ON "tags" ("status", "slug")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "tags_usage_count_idx" ON "tags" ("status", "usage_count")');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "server_media" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
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
      )
    `);
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_media_server_kind_idx" ON "server_media" ("server_id", "kind")');
    await createIndex(client, 'CREATE UNIQUE INDEX IF NOT EXISTS "server_media_one_active_kind_idx" ON "server_media" ("server_id", "kind") WHERE "status" = \'active\'');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "platform_roles" (
        "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
        "role" "platform_role_name" NOT NULL,
        "granted_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "server_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
        "reporter_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "reason" "server_report_reason" NOT NULL,
        "details" text,
        "status" "server_report_status" DEFAULT 'open'::"server_report_status" NOT NULL,
        "assigned_to_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "server_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
        "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "rating" smallint NOT NULL CHECK ("rating" between 1 and 5),
        "content" text NOT NULL CHECK (char_length(btrim("content")) between 10 and 2000),
        "status" "server_review_status" DEFAULT 'published'::"server_review_status" NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "review_replies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "review_id" uuid NOT NULL REFERENCES "server_reviews"("id") ON DELETE CASCADE,
        "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "content" text NOT NULL CHECK (char_length(btrim("content")) between 10 and 2000),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "server_review_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
        "review_id" uuid REFERENCES "server_reviews"("id") ON DELETE SET NULL,
        "reporter_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "reason" "server_review_report_reason" NOT NULL,
        "details" text CHECK ("details" is null or char_length("details") <= 1000),
        "status" "server_review_report_status" DEFAULT 'open'::"server_review_report_status" NOT NULL,
        "assigned_to_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query('DROP INDEX IF EXISTS "server_reviews_one_per_user_idx"');
    await createIndex(client, 'CREATE UNIQUE INDEX "server_reviews_one_per_user_idx" ON "server_reviews" ("server_id", "user_id") WHERE "status" <> \'deleted\'');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_reviews_server_status_created_idx" ON "server_reviews" ("server_id", "status", "created_at")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_reviews_user_id_idx" ON "server_reviews" ("user_id")');
    await createIndex(client, 'CREATE UNIQUE INDEX IF NOT EXISTS "review_replies_one_per_review_idx" ON "review_replies" ("review_id")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "review_replies_user_id_idx" ON "review_replies" ("user_id")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_review_reports_queue_idx" ON "server_review_reports" ("status", "created_at")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_review_reports_review_idx" ON "server_review_reports" ("review_id", "status")');
    await createIndex(client, 'CREATE UNIQUE INDEX IF NOT EXISTS "server_review_reports_one_open_per_user_review_idx" ON "server_review_reports" ("review_id", "reporter_user_id") WHERE "status" = \'open\' and "review_id" is not null and "reporter_user_id" is not null');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "moderation_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
        "report_id" uuid REFERENCES "server_reports"("id") ON DELETE SET NULL,
        "review_id" uuid REFERENCES "server_reviews"("id") ON DELETE SET NULL,
        "review_report_id" uuid REFERENCES "server_review_reports"("id") ON DELETE SET NULL,
        "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "action" "moderation_action" NOT NULL,
        "details" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await addColumn(client, "moderation_events", '"review_id" uuid');
    await addColumn(client, "moderation_events", '"review_report_id" uuid');
    await client.query(`
      DO $do$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = 'moderation_events'::regclass
            AND c.confrelid = 'server_reviews'::regclass
            AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (review_id)%'
        ) THEN
          ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_review_fk" FOREIGN KEY ("review_id") REFERENCES "server_reviews"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = 'moderation_events'::regclass
            AND c.confrelid = 'server_review_reports'::regclass
            AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (review_report_id)%'
        ) THEN
          ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_review_report_fk" FOREIGN KEY ("review_report_id") REFERENCES "server_review_reports"("id") ON DELETE SET NULL;
        END IF;
      END
      $do$;
    `);
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "server_reports_queue_idx" ON "server_reports" ("status", "created_at")');
    await createIndex(client, 'CREATE UNIQUE INDEX IF NOT EXISTS "server_reports_one_open_per_user_server_idx" ON "server_reports" ("server_id", "reporter_user_id") WHERE "status" = \'open\'');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "moderation_events_server_created_idx" ON "moderation_events" ("server_id", "created_at")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "moderation_events_review_created_idx" ON "moderation_events" ("review_id", "created_at")');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "moderation_events_review_report_created_idx" ON "moderation_events" ("review_report_id", "created_at")');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "media_cleanup_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "blob_key" varchar(512) NOT NULL UNIQUE,
        "status" "media_cleanup_status" DEFAULT 'pending'::"media_cleanup_status" NOT NULL,
        "attempts" smallint DEFAULT 0 NOT NULL,
        "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
        "last_error" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "media_cleanup_jobs_queue_idx" ON "media_cleanup_jobs" ("status", "next_attempt_at")');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "media_usage_counters" (
        "period" varchar(7) PRIMARY KEY,
        "stored_bytes" integer DEFAULT 0 NOT NULL,
        "advanced_operations" integer DEFAULT 0 NOT NULL,
        "alerted_70" timestamp with time zone,
        "alerted_85" timestamp with time zone,
        "alerted_95" timestamp with time zone,
        "blocked_at" timestamp with time zone,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "notification_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "dedupe_key" varchar(255) NOT NULL UNIQUE,
        "recipient_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
        "recipient_email" varchar(320) NOT NULL,
        "template" varchar(80) NOT NULL,
        "payload" jsonb DEFAULT '{}' NOT NULL,
        "status" "notification_job_status" DEFAULT 'pending'::"notification_job_status" NOT NULL,
        "attempts" smallint DEFAULT 0 NOT NULL,
        "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
        "last_error" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "sent_at" timestamp with time zone
      )
    `);
    await addColumn(client, "notification_jobs", '"processing_started_at" timestamp with time zone');
    await createIndex(client, 'CREATE INDEX IF NOT EXISTS "notification_jobs_queue_idx" ON "notification_jobs" ("status", "next_attempt_at")');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "monitor_runs" (
        "run_id" varchar(100) PRIMARY KEY,
        "nonce" varchar(128) NOT NULL UNIQUE,
        "expires_at" timestamp with time zone NOT NULL,
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    await client.query("CREATE INDEX IF NOT EXISTS servers_name_trgm_idx ON servers USING gin (lower(name) gin_trgm_ops)");
    await client.query("CREATE INDEX IF NOT EXISTS servers_description_trgm_idx ON servers USING gin (lower(description) gin_trgm_ops)");
    await client.query("CREATE INDEX IF NOT EXISTS tags_slug_trgm_idx ON tags USING gin (lower(slug) gin_trgm_ops)");

    console.log("Integration database schema is ready.");
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
