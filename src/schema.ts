import { defineRelationsPart } from "drizzle-orm";
import {
  check,
  integer,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
]);

export const serverMemberRole = pgEnum("server_member_role", [
  "owner",
  "admin",
  "editor",
]);

export const minecraftEdition = pgEnum("minecraft_edition", [
  "java",
  "bedrock",
]);

export const servers = pgTable("servers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  description: text("description"),
  websiteUrl: text("website_url"),
  discordUrl: text("discord_url"),
  publicationStatus: serverPublicationStatus("publication_status")
    .default("published")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const serverEndpoints = pgTable(
  "server_endpoints",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    edition: minecraftEdition("edition").notNull(),
    host: varchar("host", { length: 253 }).notNull(),
    port: integer("port").notNull(),
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
    unique("server_endpoints_edition_host_port_key").on(
      table.edition,
      table.host,
      table.port,
    ),
    check(
      "server_endpoints_port_check",
      sql`${table.port} between 1 and 65535`,
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

export const appRelations = defineRelationsPart(
  { testsTable, servers, serverEndpoints, serverMembers, user },
  (r) => ({
    servers: {
      endpoints: r.many.serverEndpoints(),
      members: r.many.serverMembers(),
    },
    serverEndpoints: {
      server: r.one.servers({
        from: r.serverEndpoints.serverId,
        to: r.servers.id,
      }),
    },
    serverMembers: {
      server: r.one.servers({
        from: r.serverMembers.serverId,
        to: r.servers.id,
      }),
      user: r.one.user({
        from: r.serverMembers.userId,
        to: r.user.id,
      }),
    },
  }),
);
