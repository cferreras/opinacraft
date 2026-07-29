import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverMembers,
  serverVerifications,
  servers,
} from "@/schema";

export type ManagedServer = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  discordUrl: string | null;
  publicationStatus: "draft" | "published" | "hidden";
  verificationStatus: "unverified" | "verified";
  createdAt: Date;
  updatedAt: Date;
  role: "owner" | "admin" | "editor";
  endpoints: Array<{
    edition: "java" | "bedrock";
    host: string;
    port: number;
  }>;
};

export type PublicServer = Omit<ManagedServer, "role">;

type ServerRow = {
  server: Omit<ManagedServer, "role" | "endpoints">;
  role?: ManagedServer["role"] | null;
  endpoint: { edition: ManagedServer["endpoints"][number]["edition"]; host: string; port: number } | null;
};

type ManagedServerRow = ServerRow & { role: ManagedServer["role"] };
type PublicServerRow = ServerRow & { role?: null };

function groupServerRows(rows: ManagedServerRow[]): ManagedServer[];
function groupServerRows(rows: PublicServerRow[]): PublicServer[];
function groupServerRows(rows: ServerRow[]): Array<ManagedServer | PublicServer> {
  const grouped = new Map<string, ManagedServer | PublicServer>();

  for (const row of rows) {
    const existing = grouped.get(row.server.id);
    const endpoint = row.endpoint;

    if (existing) {
      if (endpoint && !existing.endpoints.some((item) => item.edition === endpoint.edition)) {
        existing.endpoints.push(endpoint);
      }
      continue;
    }

    const server = {
      ...row.server,
      endpoints: endpoint ? [endpoint] : [],
    };
    grouped.set(
      row.server.id,
      row.role ? { ...server, role: row.role } : server,
    );
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
        verificationStatus: servers.verificationStatus,
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

export async function listPublishedServers(): Promise<PublicServer[]> {
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
        verificationStatus: servers.verificationStatus,
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
    .where(eq(servers.publicationStatus, "published"))
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
        verificationStatus: servers.verificationStatus,
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

  return groupServerRows(rows)[0] ?? null;
}

export async function getManagedServerBySlug(slug: string, userId: string) {
  const [server] = await db
    .select({
      id: servers.id,
      name: servers.name,
      slug: servers.slug,
      description: servers.description,
      websiteUrl: servers.websiteUrl,
      discordUrl: servers.discordUrl,
      publicationStatus: servers.publicationStatus,
      verificationStatus: servers.verificationStatus,
      verifiedAt: servers.verifiedAt,
      createdAt: servers.createdAt,
      updatedAt: servers.updatedAt,
      role: serverMembers.role,
    })
    .from(servers)
    .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
    .where(and(eq(servers.slug, slug), eq(serverMembers.userId, userId)))
    .limit(1);

  if (!server) return null;

  const [endpoints, latestVerification] = await Promise.all([
    db
      .select({
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
      })
      .from(serverEndpoints)
      .where(eq(serverEndpoints.serverId, server.id))
      .orderBy(asc(serverEndpoints.edition)),
    db
      .select({
        id: serverVerifications.id,
        status: serverVerifications.status,
        attemptCount: serverVerifications.attemptCount,
        lastFailureCode: serverVerifications.lastFailureCode,
        lastAttemptAt: serverVerifications.lastAttemptAt,
        expiresAt: serverVerifications.expiresAt,
        verifiedAt: serverVerifications.verifiedAt,
      })
      .from(serverVerifications)
      .where(eq(serverVerifications.serverId, server.id))
      .orderBy(desc(serverVerifications.createdAt))
      .limit(1),
  ]);

  return {
    ...server,
    endpoints,
    latestVerification: latestVerification[0] ?? null,
  };
}
