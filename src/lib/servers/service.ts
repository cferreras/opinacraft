import { randomUUID } from "node:crypto";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import {
  serverEndpoints,
  serverNetworkTargets,
  serverMembers,
  serverVerifications,
  serverMedia,
  monitorSyncOutbox,
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
import { releaseMediaQuota } from "@/lib/media/quota";

const RESERVED_SLUGS = new Set(["new"]);
const MAX_SLUG_ATTEMPTS = 8;
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function enqueueMonitorSync(
  tx: DatabaseTransaction,
  serverId: string,
  operation: "upsert" | "delete",
  payload: Record<string, unknown> = {},
) {
  await tx.insert(monitorSyncOutbox).values({
    dedupeKey: `server:${serverId}`,
    serverId,
    operation,
    payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    processedAt: null,
  }).onConflictDoUpdate({
    target: monitorSyncOutbox.dedupeKey,
    set: {
      operation,
      payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      processedAt: null,
    },
  });
}

async function tryFlushMonitorSync(serverId: string) {
  try {
    const { processMonitorSyncOutbox } = await import("./monitor-sync");
    await processMonitorSyncOutbox({ serverId, limit: 1 });
  } catch (error) {
    // The Neon transaction is already durable; the outbox cron remains the
    // recovery path when Monitor API is temporarily unavailable.
    console.error("[monitor] immediate sync attempt failed", serverId, error instanceof Error ? error.name : "unknown");
  }
}

export class UnverifiedEmailError extends Error {
  constructor() {
    super("Verify your email before creating or publishing a server.");
    this.name = "UnverifiedEmailError";
  }
}

export class NoVerifiedEndpointError extends Error {
  constructor() {
    super("Verifica al menos un endpoint de Minecraft antes de publicar este servidor.");
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
    storeUrl: input.storeUrl,
    discordUrl: input.discordUrl,
    accessType: input.accessType,
    accessFormUrl: input.accessFormUrl,
    accountMode: input.accountMode,
    authMode: input.authMode,
    publicationStatus: "draft",
  });
  await tx.insert(serverNetworkTargets).values({
    serverId,
    host: input.host,
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
  await enqueueMonitorSync(tx, serverId, "upsert");

  return { id: serverId, slug };
}

export async function createServer(userId: string, rawInput: CreateServerInput) {
  await requireVerifiedEmail(userId);
  const input = normalizeCreateServerInput(rawInput);

  const baseSlug = slugifyServerName(input.name);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = slugCandidate(baseSlug, attempt);

    try {
      const result = await db.transaction(async (tx) => {
        await assertEndpointAvailability(tx, input);
        return insertServerBundle(tx, userId, input, slug);
      });
      await tryFlushMonitorSync(result.id);
      return result;
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

  const result = await db.transaction(async (tx) => {
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
        historySourceId: serverEndpoints.historySourceId,
        verificationStatus: serverEndpoints.verificationStatus,
      })
      .from(serverEndpoints)
      .where(eq(serverEndpoints.serverId, serverId));
    const [networkTarget] = await tx
      .select({ host: serverNetworkTargets.host })
      .from(serverNetworkTargets)
      .where(eq(serverNetworkTargets.serverId, serverId))
      .limit(1);

    const nextJava = input.endpoints.find((endpoint) => endpoint.edition === "java");
    const currentJava = currentEndpoints.find((endpoint) => endpoint.edition === "java");
    const hostChanged = currentEndpoints.some((endpoint) => endpoint.host !== input.host) || networkTarget?.host !== input.host;
    const javaChanged = hostChanged || currentJava?.port !== nextJava?.port;
    const endpointsChanged =
      !networkTarget ||
      hostChanged ||
      currentEndpoints.length !== input.endpoints.length ||
      input.endpoints.some((next) => {
        const current = currentEndpoints.find((item) => item.edition === next.edition);
        return !current || current.port !== next.port;
      });
    const changedEditions = minecraftEditions.filter((edition) => {
      const next = input.endpoints.find((endpoint) => endpoint.edition === edition);
      const current = currentEndpoints.find((endpoint) => endpoint.edition === edition);
      return hostChanged || current?.port !== next?.port;
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
        storeUrl: input.storeUrl,
        discordUrl: input.discordUrl,
        accessType: input.accessType,
        accessFormUrl: input.accessFormUrl,
        accountMode: input.accountMode,
        authMode: input.authMode,
        ...(publicationStatus ? { publicationStatus } : {}),
        ...(publicationStatus === "published" ? { availabilityHiddenAt: null } : {}),
        ...(javaChanged
          ? { verificationStatus: "unverified" as const, verifiedAt: null }
          : {}),
        ...(endpointsChanged
          ? {
            monitorHealthStatus: "unknown" as const,
            monitorPlayersCurrent: null,
            monitorPlayersMax: null,
            monitorVersion: null,
            monitorLatencyMs: null,
            monitorLastCheckedAt: null,
            monitorLastOnlineAt: null,
            monitorConsecutiveFailures: 0,
            monitorProbeEdition: null,
          }
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
      if (networkTarget) {
        await tx
          .update(serverNetworkTargets)
          .set({ host: input.host })
          .where(eq(serverNetworkTargets.serverId, serverId));
      } else {
        await tx.insert(serverNetworkTargets).values({ serverId, host: input.host });
      }
      const nextEditions = new Set(input.endpoints.map((endpoint) => endpoint.edition));
      for (const current of currentEndpoints) {
        if (!nextEditions.has(current.edition)) {
          await tx
            .delete(serverEndpoints)
            .where(
              and(
                eq(serverEndpoints.serverId, serverId),
                eq(serverEndpoints.edition, current.edition),
              ),
            );
        }
      }
      for (const endpoint of input.endpoints) {
        const current = currentEndpoints.find((item) => item.edition === endpoint.edition);
        if (!current) {
          await tx.insert(serverEndpoints).values({
            serverId,
            edition: endpoint.edition,
            host: endpoint.host,
            port: endpoint.port,
            verificationStatus: "unverified",
          });
          continue;
        }

        const changed = hostChanged || current.port !== endpoint.port;
        if (changed) {
          await tx
            .update(serverEndpoints)
            .set({
              host: endpoint.host,
              port: endpoint.port,
              historySourceId: randomUUID(),
              verificationStatus: "unverified",
              healthStatus: "unknown",
              playersCurrent: null,
              playersMax: null,
              version: null,
              latencyMs: null,
              lastCheckedAt: null,
              lastOnlineAt: null,
              consecutiveFailures: 0,
            })
            .where(
              and(
                eq(serverEndpoints.serverId, serverId),
                eq(serverEndpoints.edition, endpoint.edition),
              ),
            );
        }
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

    await enqueueMonitorSync(tx, serverId, "upsert");

    return { role, javaChanged };
  });
  await tryFlushMonitorSync(serverId);
  return result;
}

export async function deleteServer(userId: string, serverId: string, confirmation: string) {
  if (confirmation !== "DELETE") throw new Error("Type DELETE to confirm server deletion.");
  const media = await db.transaction(async (tx) => {
    await requireServerCapability(serverId, userId, "identity:edit", tx);
    const rows = await tx
      .select({ blobKey: serverMedia.blobKey, bytes: serverMedia.bytes })
      .from(serverMedia)
      .where(eq(serverMedia.serverId, serverId));
    await enqueueMonitorSync(tx, serverId, "delete");
    await tx.delete(servers).where(eq(servers.id, serverId));
    return {
      rows,
      mediaBytes: rows.reduce((total, row) => total + row.bytes, 0),
    };
  });
  await tryFlushMonitorSync(serverId);
  if (media.mediaBytes > 0) await releaseMediaQuota(media.mediaBytes).catch(() => undefined);
  await Promise.all(
    media.rows.map(({ blobKey }) =>
      mediaStorage.remove(blobKey).catch((error) =>
        enqueueMediaCleanup(blobKey, error).catch((cleanupError) => {
          console.error("Failed to enqueue media cleanup", cleanupError);
        }),
      ),
    ),
  );
}
