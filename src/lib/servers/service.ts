import { randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  serverEndpoints,
  serverMembers,
  serverVerifications,
  servers,
} from "@/schema";
import {
  normalizeCreateServerInput,
  normalizeUpdateServerInput,
  slugifyServerName,
  type CreateServerInput,
  type UpdateServerInput,
  type NormalizedCreateServerInput,
} from "@/lib/servers/validation";
import { requireServerCapability } from "@/lib/servers/permissions";
import { databaseConstraint, databaseErrorCode } from "@/lib/db-errors";

const RESERVED_SLUGS = new Set(["new"]);
const MAX_SLUG_ATTEMPTS = 8;
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class DuplicateEndpointError extends Error {
  constructor() {
    super("A server with one of these addresses already exists.");
    this.name = "DuplicateEndpointError";
  }
}

export class SlugGenerationError extends Error {
  constructor() {
    super("Unable to generate a unique server URL.");
    this.name = "SlugGenerationError";
  }
}

export class ServerNotFoundError extends Error {
  constructor() {
    super("Server not found.");
    this.name = "ServerNotFoundError";
  }
}

function slugCandidate(base: string, attempt: number) {
  const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
  return RESERVED_SLUGS.has(candidate) ? `${candidate}-server` : candidate;
}

async function lockEndpoint(tx: DatabaseTransaction, endpoint: NormalizedCreateServerInput["endpoints"][number]) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${endpoint.edition}:${endpoint.host}:${endpoint.port}`}))`,
  );
}

async function assertEndpointAvailability(
  tx: DatabaseTransaction,
  input: NormalizedCreateServerInput,
  excludedServerId?: string,
) {
  const endpoints = [...input.endpoints].sort((a, b) =>
    `${a.edition}:${a.host}:${a.port}`.localeCompare(`${b.edition}:${b.host}:${b.port}`),
  );
  for (const endpoint of endpoints) {
    await lockEndpoint(tx, endpoint);
    const [existing] = await tx
      .select({ serverId: serverEndpoints.serverId })
      .from(serverEndpoints)
      .innerJoin(servers, eq(serverEndpoints.serverId, servers.id))
      .where(
        and(
          eq(serverEndpoints.edition, endpoint.edition),
          eq(serverEndpoints.host, endpoint.host),
          eq(serverEndpoints.port, endpoint.port),
          eq(serverEndpoints.verificationStatus, "verified"),
          ...(excludedServerId ? [ne(servers.id, excludedServerId)] : []),
        ),
      )
      .limit(1);

    if (existing) {
      throw new DuplicateEndpointError();
    }
  }
}

async function insertServerBundle(
  tx: DatabaseTransaction,
  userId: string,
  input: NormalizedCreateServerInput,
  slug: string,
) {
  const serverId = randomUUID();
  await tx.insert(servers).values({
    id: serverId,
    name: input.name,
    slug,
    description: input.description,
    websiteUrl: input.websiteUrl,
    discordUrl: input.discordUrl,
    publicationStatus: "draft",
  });
  for (const endpoint of input.endpoints) {
    await tx.insert(serverEndpoints).values({
      serverId,
      edition: endpoint.edition,
      host: endpoint.host,
      port: endpoint.port,
    });
  }
  await tx.insert(serverMembers).values({
    serverId,
    userId,
    role: "owner",
  });

  return { id: serverId, slug };
}

export async function createServer(userId: string, rawInput: CreateServerInput) {
  const input = normalizeCreateServerInput(rawInput);

  const baseSlug = slugifyServerName(input.name);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = slugCandidate(baseSlug, attempt);

    try {
      return await db.transaction(async (tx) => {
        await assertEndpointAvailability(tx, input);
        return insertServerBundle(tx, userId, input, slug);
      });
    } catch (error) {
      if (
        databaseErrorCode(error) === "23505" &&
        ["servers_slug_key", "servers_slug_unique"].includes(
          databaseConstraint(error) ?? "",
        )
      ) {
        continue;
      }

      if (
        databaseErrorCode(error) === "23505" &&
        databaseConstraint(error) === "server_endpoints_verified_edition_host_port_key"
      ) {
        throw new DuplicateEndpointError();
      }

      throw error;
    }
  }

  throw new SlugGenerationError();
}

export async function updateServer(
  userId: string,
  serverId: string,
  rawInput: UpdateServerInput,
  publicationStatus?: "draft" | "published" | "hidden",
) {
  const input = normalizeUpdateServerInput(rawInput);

  return db.transaction(async (tx) => {
    const [server] = await tx
      .select({
        id: servers.id,
        name: servers.name,
        verificationStatus: servers.verificationStatus,
      })
      .from(servers)
      .where(eq(servers.id, serverId))
      .for("update")
      .limit(1);

    if (!server) {
      throw new ServerNotFoundError();
    }

    const role = await requireServerCapability(
      serverId,
      userId,
      "content:edit",
      tx,
    );

    if (publicationStatus !== undefined) {
      await requireServerCapability(serverId, userId, "publication:edit", tx);
    }

    const currentEndpoints = await tx
      .select({
        edition: serverEndpoints.edition,
        host: serverEndpoints.host,
        port: serverEndpoints.port,
        verificationStatus: serverEndpoints.verificationStatus,
      })
      .from(serverEndpoints)
      .where(eq(serverEndpoints.serverId, serverId));

    const nextJava = input.endpoints.find((endpoint) => endpoint.edition === "java");
    const currentJava = currentEndpoints.find((endpoint) => endpoint.edition === "java");
    const javaChanged =
      currentJava?.host !== nextJava?.host || currentJava?.port !== nextJava?.port;
    const endpointsChanged =
      currentEndpoints.length !== input.endpoints.length ||
      input.endpoints.some((next) => {
        const current = currentEndpoints.find((item) => item.edition === next.edition);
        return !current || current.host !== next.host || current.port !== next.port;
      });

    if (input.name !== server.name) {
      await requireServerCapability(serverId, userId, "identity:edit", tx);
    }

    if (endpointsChanged) {
      await requireServerCapability(serverId, userId, "endpoint:edit", tx);
      await assertEndpointAvailability(tx, input, serverId);
    }

    await tx
      .update(servers)
      .set({
        name: input.name,
        description: input.description,
        websiteUrl: input.websiteUrl,
        discordUrl: input.discordUrl,
        ...(publicationStatus ? { publicationStatus } : {}),
        ...(javaChanged
          ? { verificationStatus: "unverified" as const, verifiedAt: null }
          : {}),
      })
      .where(eq(servers.id, serverId));

    if (javaChanged) {
      await tx
        .update(serverVerifications)
        .set({ status: "superseded", lastFailureCode: "endpoint_changed" })
        .where(
          and(
            eq(serverVerifications.serverId, serverId),
            eq(serverVerifications.status, "pending"),
          ),
        );
    }

    if (endpointsChanged) {
      await tx.delete(serverEndpoints).where(eq(serverEndpoints.serverId, serverId));
      for (const endpoint of input.endpoints) {
        const current = currentEndpoints.find((item) => item.edition === endpoint.edition);
        await tx.insert(serverEndpoints).values({
          serverId,
          edition: endpoint.edition,
          host: endpoint.host,
          port: endpoint.port,
          verificationStatus:
            endpoint.edition === "java" &&
            current?.verificationStatus === "verified" &&
            !javaChanged &&
            current?.host === endpoint.host &&
            current?.port === endpoint.port
              ? "verified"
              : "unverified",
        });
      }
    }

    return { role, javaChanged };
  });
}
