import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { serverEndpoints, serverMembers, servers } from "@/schema";
import {
  normalizeCreateServerInput,
  slugifyServerName,
  type CreateServerInput,
  type NormalizedCreateServerInput,
} from "@/lib/servers/validation";

const RESERVED_SLUGS = new Set(["new"]);
const MAX_SLUG_ATTEMPTS = 8;

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

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.cause?.code === "string"
      ? candidate.cause.code
      : undefined;
}

function databaseConstraint(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    constraint?: unknown;
    cause?: { constraint?: unknown };
  };

  return typeof candidate.constraint === "string"
    ? candidate.constraint
    : typeof candidate.cause?.constraint === "string"
      ? candidate.cause.constraint
      : undefined;
}

function slugCandidate(base: string, attempt: number) {
  const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
  return RESERVED_SLUGS.has(candidate) ? `${candidate}-server` : candidate;
}

async function assertEndpointAvailability(input: NormalizedCreateServerInput) {
  for (const endpoint of input.endpoints) {
    const [existing] = await db
      .select({ serverId: serverEndpoints.serverId })
      .from(serverEndpoints)
      .where(
        and(
          eq(serverEndpoints.edition, endpoint.edition),
          eq(serverEndpoints.host, endpoint.host),
          eq(serverEndpoints.port, endpoint.port),
        ),
      )
      .limit(1);

    if (existing) {
      throw new DuplicateEndpointError();
    }
  }
}

async function insertServerBundle(
  userId: string,
  input: NormalizedCreateServerInput,
  slug: string,
) {
  const serverId = randomUUID();
  const serverInsert = db.insert(servers).values({
    id: serverId,
    name: input.name,
    slug,
    description: input.description,
    websiteUrl: input.websiteUrl,
    discordUrl: input.discordUrl,
    publicationStatus: "published",
  });
  const endpointInserts = input.endpoints.map((endpoint) =>
    db.insert(serverEndpoints).values({
      serverId,
      edition: endpoint.edition,
      host: endpoint.host,
      port: endpoint.port,
    }),
  );
  const memberInsert = db.insert(serverMembers).values({
    serverId,
    userId,
    role: "owner",
  });

  if (endpointInserts.length === 1) {
    await db.batch([serverInsert, endpointInserts[0], memberInsert]);
  } else {
    await db.batch([serverInsert, endpointInserts[0], endpointInserts[1], memberInsert]);
  }

  return { id: serverId, slug };
}

export async function createServer(userId: string, rawInput: CreateServerInput) {
  const input = normalizeCreateServerInput(rawInput);
  await assertEndpointAvailability(input);

  const baseSlug = slugifyServerName(input.name);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = slugCandidate(baseSlug, attempt);

    try {
      return await insertServerBundle(userId, input, slug);
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
        databaseConstraint(error) ===
          "server_endpoints_edition_host_port_key"
      ) {
        throw new DuplicateEndpointError();
      }

      throw error;
    }
  }

  throw new SlugGenerationError();
}
