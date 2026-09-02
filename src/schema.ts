import {
  check,
  bytea,
  bigint,
  foreignKey,
  integer,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth-schema";

export const serverPublicationStatus = pgEnum("server_publication_status", [
  "draft",
  "published",
  "hidden",
]);

export const serverVerificationStatus = pgEnum("server_verification_status", [
  "unverified",
  "verified",
]);

export const serverVerificationAttemptStatus = pgEnum(
  "server_verification_attempt_status",
  ["pending", "verified", "failed", "expired", "superseded"],
);

export const serverVerificationMethod = pgEnum("server_verification_method", [
  "motd_java",
  "motd_bedrock",
]);

export const serverVerificationFailureCode = pgEnum(
  "server_verification_failure_code",
  [
    "offline",
    "timeout",
    "invalid_response",
    "code_not_found",
    "blocked_target",
    "endpoint_changed",
  ],
);

export const serverMemberRole = pgEnum("server_member_role", [
  "owner",
  "admin",
  "editor",
]);

export const serverMediaKind = pgEnum("server_media_kind", ["logo", "banner"]);

export const serverMediaStatus = pgEnum("server_media_status", [
  "pending",
  "active",
  "failed",
  "deleted",
]);

export const serverEndpointHealth = pgEnum("server_endpoint_health", [
  "unknown",
  "online",
  "offline",
]);

export const serverEndpointSampleFailure = pgEnum("server_endpoint_sample_failure", [
  "unreachable",
  "timeout",
  "invalid_response",
  "dns_error",
  "blocked_target",
  "monitor_error",
]);

export const platformRoleName = pgEnum("platform_role_name", ["moderator", "admin"]);
export const serverReportReason = pgEnum("server_report_reason", ["inappropriate", "misleading", "offline", "copyright", "other"]);
export const serverReportStatus = pgEnum("server_report_status", ["open", "dismissed", "actioned"]);
export const moderationAction = pgEnum("moderation_action", ["report_created", "dismissed", "hidden", "restored", "reopened"]);
export const serverModerationStatus = pgEnum("server_moderation_status", ["active", "blocked"]);
export const mediaCleanupStatus = pgEnum("media_cleanup_status", ["pending", "processing", "done", "failed"]);
export const serverReviewStatus = pgEnum("server_review_status", ["published", "hidden", "deleted"]);
export const serverReviewReportReason = pgEnum("server_review_report_reason", [
  "spam",
  "harassment",
  "offensive",
  "false_information",
  "conflict_of_interest",
  "other",
]);
export const serverReviewReportStatus = pgEnum("server_review_report_status", ["open", "dismissed", "actioned"]);

export const minecraftEdition = pgEnum("minecraft_edition", [
  "java",
  "bedrock",
]);

export const serverAccessType = pgEnum("server_access_type", [
  "open",
  "whitelist",
]);

export const serverAccountMode = pgEnum("server_account_mode", [
  "premium_only",
  "premium_and_non_premium",
]);

export const serverAuthMode = pgEnum("server_auth_mode", [
  "direct",
  "password_non_premium",
  "password_all",
]);

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    description: text("description"),
    websiteUrl: text("website_url"),
    storeUrl: text("store_url"),
    discordUrl: text("discord_url"),
    country: varchar("country", { length: 8 }),
    accessType: serverAccessType("access_type").default("open").notNull(),
    accessFormUrl: text("access_form_url"),
    accountMode: serverAccountMode("account_mode").default("premium_only").notNull(),
    authMode: serverAuthMode("auth_mode").default("direct").notNull(),
    moderationStatus: serverModerationStatus("moderation_status").default("active").notNull(),
    availabilityHiddenAt: timestamp("availability_hidden_at", { withTimezone: true }),
    publicationStatus: serverPublicationStatus("publication_status")
      .default("draft")
      .notNull(),
    verificationStatus: serverVerificationStatus("verification_status")
      .default("unverified")
      .notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    monitorHealthStatus: serverEndpointHealth("monitor_health_status").default("unknown").notNull(),
    monitorPlayersCurrent: integer("monitor_players_current"),
    monitorPlayersMax: integer("monitor_players_max"),
    monitorVersion: varchar("monitor_version", { length: 100 }),
    monitorLatencyMs: integer("monitor_latency_ms"),
    monitorLastCheckedAt: timestamp("monitor_last_checked_at", { withTimezone: true }),
    monitorLastOnlineAt: timestamp("monitor_last_online_at", { withTimezone: true }),
    monitorConsecutiveFailures: smallint("monitor_consecutive_failures").default(0).notNull(),
    monitorProbeEdition: minecraftEdition("monitor_probe_edition"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "servers_verified_at_check",
      sql`(${table.verificationStatus} = 'verified') = (${table.verifiedAt} is not null)`,
    ),
    check(
      "servers_access_form_url_check",
      sql`(${table.accessType} = 'whitelist') OR (${table.accessFormUrl} is null)`,
    ),
    check(
      "servers_account_auth_mode_check",
      sql`(${table.accountMode} = 'premium_only' AND ${table.authMode} = 'direct') OR (${table.accountMode} = 'premium_and_non_premium' AND ${table.authMode} in ('password_non_premium', 'password_all'))`,
    ),
    index("servers_publication_verification_idx").on(
      table.publicationStatus,
      table.verificationStatus,
    ),
  ],
);

export const serverNetworkTargets = pgTable(
  "server_network_targets",
  {
    serverId: uuid("server_id")
      .primaryKey()
      .references(() => servers.id, { onDelete: "cascade" }),
    host: varchar("host", { length: 253 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const serverEndpoints = pgTable(
  "server_endpoints",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    edition: minecraftEdition("edition").notNull(),
    historySourceId: uuid("history_source_id").defaultRandom().notNull(),
    host: varchar("host", { length: 253 }).notNull(),
    port: integer("port").notNull(),
    verificationStatus: serverVerificationStatus("verification_status")
      .default("unverified")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    healthStatus: serverEndpointHealth("health_status").default("unknown").notNull(),
    playersCurrent: integer("players_current"),
    playersMax: integer("players_max"),
    version: varchar("version", { length: 100 }),
    latencyMs: integer("latency_ms"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
    consecutiveFailures: smallint("consecutive_failures").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.edition] }),
    uniqueIndex("server_endpoints_history_source_id_key").on(table.historySourceId),
    uniqueIndex("server_endpoints_verified_edition_host_port_key")
      .on(
      table.edition,
      table.host,
      table.port,
      )
      .where(sql`${table.verificationStatus} = 'verified'`),
    check(
      "server_endpoints_port_check",
      sql`${table.port} between 1024 and 65535`,
    ),
  ],
);

export const monitorSyncOutbox = pgTable(
  "server_monitor_sync_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull().unique(),
    serverId: uuid("server_id").notNull(),
    operation: varchar("operation", { length: 20 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("server_monitor_sync_outbox_queue_idx").on(table.status, table.nextAttemptAt),
    index("server_monitor_sync_outbox_server_idx").on(table.serverId),
    check("server_monitor_sync_outbox_operation_check", sql`${table.operation} in ('upsert', 'delete')`),
    check("server_monitor_sync_outbox_status_check", sql`${table.status} in ('pending', 'processing', 'done', 'failed')`),
  ],
);

export const serverMembers = pgTable(
  "server_members",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: serverMemberRole("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.userId] }),
    index("server_members_user_id_idx").on(table.userId),
    uniqueIndex("server_members_one_owner_idx")
      .on(table.serverId)
      .where(sql`${table.role} = 'owner'`),
  ],
);

export const serverVerifications = pgTable(
  "server_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    edition: minecraftEdition("edition").default("java").notNull(),
    method: serverVerificationMethod("method").default("motd_java").notNull(),
    endpointHost: varchar("endpoint_host", { length: 253 }).notNull(),
    endpointPort: integer("endpoint_port").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    tokenCiphertext: bytea("token_ciphertext").notNull(),
    status: serverVerificationAttemptStatus("status")
      .default("pending")
      .notNull(),
    attemptCount: smallint("attempt_count").default(0).notNull(),
    lastFailureCode: serverVerificationFailureCode("last_failure_code"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "server_verifications_endpoint_port_check",
      sql`${table.endpointPort} between 1024 and 65535`,
    ),
    check(
      "server_verifications_attempt_count_check",
      sql`${table.attemptCount} between 0 and 5`,
    ),
    check(
      "server_verifications_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "server_verifications_verified_at_check",
      sql`(${table.status} = 'verified') = (${table.verifiedAt} is not null)`,
    ),
    index("server_verifications_server_created_idx").on(
      table.serverId,
      table.createdAt,
    ),
    index("server_verifications_requester_created_idx").on(
      table.serverId,
      table.requestedByUserId,
      table.createdAt,
    ),
    uniqueIndex("server_verifications_one_pending_idx")
      .on(table.serverId, table.edition)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * Modes are a closed vocabulary defined in `src/lib/servers/game-modes.ts`, so the row stores the
 * slug and nothing else: there is no modes table to join, rename or moderate. `position` keeps the
 * owner picking order so the badges read the same everywhere they are shown.
 */
export const serverGameModes = pgTable(
  "server_game_modes",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 32 }).notNull(),
    position: smallint("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.mode] }),
    index("server_game_modes_mode_idx").on(table.mode),
  ],
);

export const serverMedia = pgTable(
  "server_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    kind: serverMediaKind("kind").notNull(),
    blobKey: varchar("blob_key", { length: 512 }).notNull(),
    blobUrl: text("blob_url").notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    status: serverMediaStatus("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("server_media_server_kind_idx").on(table.serverId, table.kind),
    uniqueIndex("server_media_one_active_kind_idx")
      .on(table.serverId, table.kind)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const platformRoles = pgTable(
  "platform_roles",
  {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    role: platformRoleName("role").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const serverReports = pgTable(
  "server_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id").references(() => user.id, { onDelete: "set null" }),
    reason: serverReportReason("reason").notNull(),
    details: text("details"),
    status: serverReportStatus("status").default("open").notNull(),
    assignedToUserId: text("assigned_to_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index("server_reports_queue_idx").on(table.status, table.createdAt),
    uniqueIndex("server_reports_one_open_per_user_server_idx").on(table.serverId, table.reporterUserId).where(sql`${table.status} = 'open'`),
  ],
);

export const serverReviews = pgTable(
  "server_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    rating: smallint("rating").notNull(),
    content: text("content").notNull(),
    status: serverReviewStatus("status").default("published").notNull(),
    // Set when the author joins the server team: the review is withheld from
    // public surfaces without destroying it, and clearing the column restores it.
    withheldAt: timestamp("withheld_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("server_reviews_one_per_user_idx")
      .on(table.serverId, table.userId)
      .where(sql`${table.status} <> 'deleted'`),
    index("server_reviews_server_status_created_idx").on(table.serverId, table.status, table.createdAt),
    index("server_reviews_user_id_idx").on(table.userId),
    check("server_reviews_rating_check", sql`${table.rating} between 1 and 5`),
    check(
      "server_reviews_content_length_check",
      sql`char_length(btrim(${table.content})) between 10 and 2000`,
    ),
  ],
);

export const reviewReplies = pgTable(
  "review_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => serverReviews.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("review_replies_one_per_review_idx").on(table.reviewId),
    index("review_replies_user_id_idx").on(table.userId),
    check(
      "review_replies_content_length_check",
      sql`char_length(btrim(${table.content})) between 10 and 2000`,
    ),
  ],
);

export const serverReviewReports = pgTable(
  "server_review_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").references(() => serverReviews.id, { onDelete: "set null" }),
    reporterUserId: text("reporter_user_id").references(() => user.id, { onDelete: "set null" }),
    reason: serverReviewReportReason("reason").notNull(),
    details: text("details"),
    status: serverReviewReportStatus("status").default("open").notNull(),
    assignedToUserId: text("assigned_to_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("server_review_reports_queue_idx").on(table.status, table.createdAt),
    index("server_review_reports_review_idx").on(table.reviewId, table.status),
    uniqueIndex("server_review_reports_one_open_per_user_review_idx")
      .on(table.reviewId, table.reporterUserId)
      .where(sql`${table.status} = 'open' and ${table.reviewId} is not null and ${table.reporterUserId} is not null`),
    check(
      "server_review_reports_details_length_check",
      sql`${table.details} is null or char_length(${table.details}) <= 1000`,
    ),
  ],
);

export const moderationEvents = pgTable(
  "moderation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
    reportId: uuid("report_id").references(() => serverReports.id, { onDelete: "set null" }),
    reviewId: uuid("review_id").references(() => serverReviews.id, { onDelete: "set null" }),
    reviewReportId: uuid("review_report_id").references(() => serverReviewReports.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: moderationAction("action").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("moderation_events_server_created_idx").on(table.serverId, table.createdAt),
    index("moderation_events_review_created_idx").on(table.reviewId, table.createdAt),
    index("moderation_events_review_report_created_idx").on(table.reviewReportId, table.createdAt),
  ],
);

export const mediaCleanupJobs = pgTable(
  "media_cleanup_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blobKey: varchar("blob_key", { length: 512 }).notNull().unique(),
    status: mediaCleanupStatus("status").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index("media_cleanup_jobs_queue_idx").on(table.status, table.nextAttemptAt)],
);

export const mediaUsageCounters = pgTable(
  "media_usage_counters",
  {
    period: varchar("period", { length: 7 }).primaryKey(),
    storedBytes: bigint("stored_bytes", { mode: "number" }).default(0).notNull(),
    advancedOperations: integer("advanced_operations").default(0).notNull(),
    alerted70: timestamp("alerted_70", { withTimezone: true }),
    alerted85: timestamp("alerted_85", { withTimezone: true }),
    alerted95: timestamp("alerted_95", { withTimezone: true }),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

// Per-account slice of the shared monthly media budget. The global counters in
// `media_usage_counters` protect provider cost; this table stops one account
// from consuming the whole allowance and blocking everyone else.
export const mediaAccountUsage = pgTable(
  "media_account_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 7 }).notNull(),
    advancedOperations: integer("advanced_operations").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
    windowOperations: integer("window_operations").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.period] })],
);

export const notificationJobStatus = pgEnum("notification_job_status", ["pending", "processing", "sent", "failed"]);

export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull().unique(),
    recipientUserId: text("recipient_user_id").references(() => user.id, { onDelete: "set null" }),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    template: varchar("template", { length: 80 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: notificationJobStatus("status").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [index("notification_jobs_queue_idx").on(table.status, table.nextAttemptAt)],
);

export const monitorRuns = pgTable(
  "monitor_runs",
  {
    runId: varchar("run_id", { length: 100 }).primaryKey(),
    nonce: varchar("nonce", { length: 128 }).notNull().unique(),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    fallbackEndpoints: jsonb("fallback_endpoints").$type<Array<{ serverId: string; edition: "bedrock"; host: string; port: number; historySourceId: string }>>().default([]).notNull(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    javaPersistenceFailures: integer("java_persistence_failures").default(0).notNull(),
    bedrockPersistenceFailures: integer("bedrock_persistence_failures").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("monitor_runs_sampled_at_key").on(table.sampledAt)],
);

export const monitorJobStatus = pgEnum("monitor_job_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

export const serverMonitorSchedules = pgTable(
  "server_monitor_schedules",
  {
    serverId: uuid("server_id")
      .primaryKey()
      .references(() => servers.id, { onDelete: "cascade" }),
    cadenceMinutes: smallint("cadence_minutes").notNull(),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("server_monitor_schedules_due_idx").on(table.nextDueAt, table.serverId),
    check("server_monitor_schedules_cadence_check", sql`${table.cadenceMinutes} in (15, 60)`),
  ],
);

export const serverMonitorScheduleHistory = pgTable(
  "server_monitor_schedule_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    cadenceMinutes: smallint("cadence_minutes").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("server_monitor_schedule_history_lookup_idx").on(table.serverId, table.effectiveFrom),
    check("server_monitor_schedule_history_cadence_check", sql`${table.cadenceMinutes} in (15, 60)`),
  ],
);

export const serverMonitorJobs = pgTable(
  "server_monitor_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: monitorJobStatus("status").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseOwner: varchar("lease_owner", { length: 120 }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("server_monitor_jobs_server_scheduled_key").on(table.serverId, table.scheduledAt),
    index("server_monitor_jobs_queue_idx").on(table.status, table.nextAttemptAt, table.scheduledAt),
    index("server_monitor_jobs_lease_idx").on(table.leaseUntil),
  ],
);

export const serverPlayerSnapshots = pgTable(
  "server_player_snapshots",
  {
    serverId: uuid("server_id")
      .notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    probeEdition: minecraftEdition("probe_edition"),
    status: serverEndpointHealth("status").notNull(),
    failureCode: serverEndpointSampleFailure("failure_code"),
    playersCurrent: integer("players_current"),
    playersMax: integer("players_max"),
    version: varchar("version", { length: 100 }),
    latencyMs: integer("latency_ms"),
    jobId: uuid("job_id"),
  },
  (table) => [
    primaryKey({ name: "server_player_snapshots_pkey", columns: [table.serverId, table.scheduledAt] }),
    foreignKey({
      name: "server_player_snapshots_server_id_servers_id_fkey",
      columns: [table.serverId],
      foreignColumns: [servers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "server_player_snapshots_job_id_server_monitor_jobs_id_fkey",
      columns: [table.jobId],
      foreignColumns: [serverMonitorJobs.id],
    }).onDelete("set null"),
    index("server_player_snapshots_server_observed_idx").on(table.serverId, table.observedAt),
    check("server_player_snapshots_current_check", sql`${table.playersCurrent} is null or ${table.playersCurrent} >= 0`),
    check("server_player_snapshots_max_check", sql`${table.playersMax} is null or ${table.playersMax} >= 0`),
    check("server_player_snapshots_status_check", sql`(${table.status} = 'online' and ${table.failureCode} is null) or (${table.status} <> 'online')`),
    check("server_player_snapshots_online_players_check", sql`(${table.status} = 'online') or (${table.playersCurrent} is null and ${table.playersMax} is null)`),
  ],
);

export const serverPlayerHourly = pgTable(
  "server_player_hourly",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    lastProbeEdition: minecraftEdition("last_probe_edition"),
    sourceChanged: integer("source_changed").default(0).notNull(),
    sampleCount: integer("sample_count").default(0).notNull(),
    onlineCount: integer("online_count").default(0).notNull(),
    unknownCount: integer("unknown_count").default(0).notNull(),
    playerDataCount: integer("player_data_count").default(0).notNull(),
    playersTotal: bigint("players_total", { mode: "number" }).default(0).notNull(),
    playersPeak: integer("players_peak"),
    capacityDataCount: integer("capacity_data_count").default(0).notNull(),
    capacityTotal: bigint("capacity_total", { mode: "number" }).default(0).notNull(),
    capacityLatest: integer("capacity_latest"),
    occupancyDataCount: integer("occupancy_data_count").default(0).notNull(),
    occupancyBasisPointsTotal: bigint("occupancy_basis_points_total", { mode: "number" }).default(0).notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.bucketStart] }),
    index("server_player_hourly_server_bucket_idx").on(table.serverId, table.bucketStart),
    check("server_player_hourly_source_changed_check", sql`${table.sourceChanged} between 0 and 1`),
    check("server_player_hourly_counts_check", sql`${table.sampleCount} >= 0 and ${table.onlineCount} >= 0 and ${table.unknownCount} >= 0`),
  ],
);

export const serverEndpointPlayerSnapshots = pgTable(
  "server_endpoint_player_snapshots",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    edition: minecraftEdition("edition").notNull(),
    historySourceId: uuid("history_source_id").notNull(),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    status: serverEndpointHealth("status").notNull(),
    failureCode: serverEndpointSampleFailure("failure_code"),
    playersCurrent: integer("players_current"),
    playersMax: integer("players_max"),
    runId: varchar("run_id", { length: 100 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.edition, table.sampledAt] }),
    index("server_endpoint_player_snapshots_server_sampled_idx").on(table.serverId, table.sampledAt),
    check("server_endpoint_player_snapshots_current_check", sql`${table.playersCurrent} is null or ${table.playersCurrent} >= 0`),
    check("server_endpoint_player_snapshots_max_check", sql`${table.playersMax} is null or ${table.playersMax} >= 0`),
    check("server_endpoint_player_snapshots_status_check", sql`(${table.status} = 'online' and ${table.failureCode} is null) or (${table.status} <> 'online')`),
    check("server_endpoint_player_snapshots_online_players_check", sql`(${table.status} = 'online') or (${table.playersCurrent} is null and ${table.playersMax} is null)`),
  ],
);

export const serverEndpointPlayerHourly = pgTable(
  "server_endpoint_player_hourly",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    edition: minecraftEdition("edition").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    lastSourceId: uuid("last_source_id"),
    sourceChanged: integer("source_changed").default(0).notNull(),
    sampleCount: integer("sample_count").default(0).notNull(),
    onlineCount: integer("online_count").default(0).notNull(),
    unknownCount: integer("unknown_count").default(0).notNull(),
    playerDataCount: integer("player_data_count").default(0).notNull(),
    playersTotal: bigint("players_total", { mode: "number" }).default(0).notNull(),
    playersPeak: integer("players_peak"),
    capacityDataCount: integer("capacity_data_count").default(0).notNull(),
    capacityTotal: bigint("capacity_total", { mode: "number" }).default(0).notNull(),
    capacityLatest: integer("capacity_latest"),
    occupancyDataCount: integer("occupancy_data_count").default(0).notNull(),
    occupancyBasisPointsTotal: bigint("occupancy_basis_points_total", { mode: "number" }).default(0).notNull(),
    lastSampleAt: timestamp("last_sample_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.edition, table.bucketStart] }),
    index("server_endpoint_player_hourly_server_bucket_idx").on(table.serverId, table.bucketStart),
    check("server_endpoint_player_hourly_source_changed_check", sql`${table.sourceChanged} between 0 and 1`),
    check("server_endpoint_player_hourly_counts_check", sql`${table.sampleCount} >= 0 and ${table.onlineCount} >= 0 and ${table.unknownCount} >= 0`),
  ],
);
