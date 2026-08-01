import {
  check,
  bytea,
  bigint,
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
  type AnyPgColumn,
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

export const serverTagStatus = pgEnum("server_tag_status", [
  "active",
  "blocked",
  "merged",
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

export const platformRoleName = pgEnum("platform_role_name", ["moderator", "admin"]);
export const serverReportReason = pgEnum("server_report_reason", ["inappropriate", "misleading", "offline", "copyright", "other"]);
export const serverReportStatus = pgEnum("server_report_status", ["open", "dismissed", "actioned"]);
export const moderationAction = pgEnum("moderation_action", ["report_created", "dismissed", "hidden", "restored"]);
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

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    description: text("description"),
    websiteUrl: text("website_url"),
    discordUrl: text("discord_url"),
    moderationStatus: serverModerationStatus("moderation_status").default("active").notNull(),
    availabilityHiddenAt: timestamp("availability_hidden_at", { withTimezone: true }),
    publicationStatus: serverPublicationStatus("publication_status")
      .default("draft")
      .notNull(),
    verificationStatus: serverVerificationStatus("verification_status")
      .default("unverified")
      .notNull(),
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
      "servers_verified_at_check",
      sql`(${table.verificationStatus} = 'verified') = (${table.verifiedAt} is not null)`,
    ),
    index("servers_publication_verification_idx").on(
      table.publicationStatus,
      table.verificationStatus,
    ),
  ],
);

export const serverEndpoints = pgTable(
  "server_endpoints",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    edition: minecraftEdition("edition").notNull(),
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

export const serverTags = pgTable(
  "server_tags",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.tagId] }),
    index("server_tags_tag_id_idx").on(table.tagId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: varchar("label", { length: 40 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    status: serverTagStatus("status").default("active").notNull(),
    usageCount: integer("usage_count").default(0).notNull(),
    aliasOf: uuid("alias_of").references((): AnyPgColumn => tags.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tags_active_slug_idx").on(table.status, table.slug),
    index("tags_usage_count_idx").on(table.status, table.usageCount),
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
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    fallbackEndpoints: jsonb("fallback_endpoints").$type<Array<{ serverId: string; edition: "bedrock"; host: string; port: number }>>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const tagAliases = pgTable(
  "tag_aliases",
  {
    aliasSlug: varchar("alias_slug", { length: 64 }).primaryKey(),
    tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);
