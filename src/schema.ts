import {
  check,
  bytea,
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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { serial, snakeCase } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const testsTable = snakeCase.table("tests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

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
      .on(table.serverId)
      .where(sql`${table.status} = 'pending'`),
  ],
);
