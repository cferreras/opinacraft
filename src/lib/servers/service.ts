import { randomUUID } from "node:crypto";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import {
  serverEndpoints,
  serverMembers,
  serverVerifications,
  serverMedia,
  servers,
} from "@/schema";
import {
  normalizeCreateServerInput,
  normalizeUpdateServerInput,
  slugifyServerName,
  type CreateServerInput,
  type UpdateServerInput,
  type NormalizedCreateServerInput,
  minecraftEditions,
} from "@/lib/servers/validation";
import { requireServerCapability } from "@/lib/servers/permissions";
import { replaceServerTagsForServer } from "@/lib/servers/tags";
import { databaseConstraint, databaseErrorCode } from "@/lib/db-errors";
import { mediaStorage } from "@/lib/media/storage";
import { enqueueMediaCleanup } from "@/lib/media/cleanup";

const RESERVED_SLUGS = new Set(["new"]);
const MAX_SLUG_ATTEMPTS = 8;
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class UnverifiedEmailError extends Error {
  constructor() {
    super("Verify your email before creating or publishing a server.");
    this.name = "UnverifiedEmailError";
  }
}

export class NoVerifiedEndpointError extends Error {
  constructor() {
    super("Verify at least one Minecraft endpoint before publishing this server.");
    this.name = "NoVerifiedEndpointError";
  }
}

async function requireVerifiedEmail(
  userId: string,
  reader: Pick<typeof db, "select"> = db,
) {
  const [account] = await reader
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!account || !account.emailVerified) {
    throw new UnverifiedEmailError();
  }
}

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
  await replaceServerTagsForServer(tx, serverId, input.tags, { allowCreate: true });

  return { id: serverId, slug };
}

export async function createServer(userId: string, rawInput: CreateServerInput) {
  await requireVerifiedEmail(userId);
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
      if (publicationStatus === "published") {
        await requireVerifiedEmail(userId, tx);
      }
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
    const changedEditions = minecraftEditions.filter((edition) => {
      const next = input.endpoints.find((endpoint) => endpoint.edition === edition);
      const current = currentEndpoints.find((endpoint) => endpoint.edition === edition);
      return current?.host !== next?.host || current?.port !== next?.port;
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
        ...(publicationStatus === "published" ? { availabilityHiddenAt: null } : {}),
        ...(javaChanged
          ? { verificationStatus: "unverified" as const, verifiedAt: null }
          : {}),
      })
      .where(eq(servers.id, serverId));

    if (changedEditions.length) {
      await tx
        .update(serverVerifications)
        .set({ status: "superseded", lastFailureCode: "endpoint_changed" })
        .where(
          and(
            eq(serverVerifications.serverId, serverId),
            eq(serverVerifications.status, "pending"),
            inArray(serverVerifications.edition, changedEditions),
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
            current?.verificationStatus === "verified" &&
            !changedEditions.includes(endpoint.edition) &&
            current?.host === endpoint.host &&
            current?.port === endpoint.port
              ? "verified"
              : "unverified",
        });
      }
    }

    const [verifiedEndpoint] = await tx
      .select({ serverId: serverEndpoints.serverId })
      .from(serverEndpoints)
      .where(and(eq(serverEndpoints.serverId, serverId), eq(serverEndpoints.verificationStatus, "verified")))
      .limit(1);
    if (publicationStatus === "published" && !verifiedEndpoint) {
      throw new NoVerifiedEndpointError();
    }

    if (input.tags !== undefined) {
      if (role === "owner" && input.tags.length) await requireVerifiedEmail(userId, tx);
      await replaceServerTagsForServer(tx, serverId, input.tags, { allowCreate: role === "owner" });
    }

    await tx.update(servers).set(verifiedEndpoint ? { verificationStatus: "verified", verifiedAt: sql`coalesce(${servers.verifiedAt}, now())` } : { verificationStatus: "unverified", verifiedAt: null }).where(eq(servers.id, serverId));

    return { role, javaChanged };
  });
}

export async function deleteServer(userId: string, serverId: string, confirmation: string) {
  if (confirmation !== "DELETE") throw new Error("Type DELETE to confirm server deletion.");
  const media = await db.transaction(async (tx) => {
    await requireServerCapability(serverId, userId, "identity:edit", tx);
    const rows = await tx.select({ blobKey: serverMedia.blobKey }).from(serverMedia).where(eq(serverMedia.serverId, serverId));
    await tx.delete(servers).where(eq(servers.id, serverId));
    return rows;
  });
  await Promise.all(
    media.map(({ blobKey }) =>
      mediaStorage.remove(blobKey).catch((error) =>
        enqueueMediaCleanup(blobKey, error).catch((cleanupError) => {
          console.error("Failed to enqueue media cleanup", cleanupError);
        }),
      ),
    ),
  );
}
