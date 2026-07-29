import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { serverEndpoints, serverMembers, servers } from "@/schema";

export type ManagedServer = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  discordUrl: string | null;
  publicationStatus: "draft" | "published";
  createdAt: Date;
  updatedAt: Date;
  role: "owner" | "admin" | "editor";
  endpoints: Array<{
    edition: "java" | "bedrock";
    host: string;
    port: number;
  }>;
};

function groupServerRows<TRow extends {
  server: Omit<ManagedServer, "role" | "endpoints">;
  role?: ManagedServer["role"] | null;
  endpoint: { edition: ManagedServer["endpoints"][number]["edition"]; host: string; port: number } | null;
}>(rows: TRow[]) {
  const grouped = new Map<string, ManagedServer>();

  for (const row of rows) {
    const existing = grouped.get(row.server.id);
    const endpoint = row.endpoint;

    if (existing) {
      if (endpoint && !existing.endpoints.some((item) => item.edition === endpoint.edition)) {
        existing.endpoints.push(endpoint);
      }
      continue;
    }

    grouped.set(row.server.id, {
      ...row.server,
      role: row.role ?? "editor",
      endpoints: endpoint ? [endpoint] : [],
    });
  }

  return [...grouped.values()];
}

export async function listManagedServers(userId: string) {
  const rows = await db
    .select({
      server: {
        id: servers.id,
        name: servers.name,
        slug: servers.slug,
        description: servers.description,
        websiteUrl: servers.websiteUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
      },
      role: serverMembers.role,
      endpoint: {
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
      },
    })
    .from(serverMembers)
    .innerJoin(servers, eq(serverMembers.serverId, servers.id))
    .leftJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id))
    .where(eq(serverMembers.userId, userId))
    .orderBy(desc(servers.createdAt), asc(serverEndpoints.edition));

  return groupServerRows(rows);
}

export async function getPublishedServerBySlug(slug: string) {
  const rows = await db
    .select({
      server: {
        id: servers.id,
        name: servers.name,
        slug: servers.slug,
        description: servers.description,
        websiteUrl: servers.websiteUrl,
        discordUrl: servers.discordUrl,
        publicationStatus: servers.publicationStatus,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
      },
      endpoint: {
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
      },
    })
    .from(servers)
    .leftJoin(serverEndpoints, eq(serverEndpoints.serverId, servers.id))
    .where(
      and(eq(servers.slug, slug), eq(servers.publicationStatus, "published")),
    )
    .orderBy(asc(serverEndpoints.edition));

  if (rows.length === 0) {
    return null;
  }

  return groupServerRows(
    rows.map((row) => ({ ...row, role: null })),
  )[0] ?? null;
}
