import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import * as z from "zod";

import { isPublicAddress } from "../minecraft/address.ts";
import {
  defaultMinecraftPort,
  MINECRAFT_PORT_MAX,
  MINECRAFT_PORT_MIN,
} from "./endpoint-fields.ts";
import {
  serverAccessTypes,
  serverAccountModes,
  serverAuthModes,
  type ServerAccessType,
  type ServerAccountMode,
  type ServerAuthMode,
} from "./access.ts";
import {
  normalizeServerDescription,
  SERVER_DESCRIPTION_MAX_LENGTH,
} from "./description.ts";
import { MAX_SERVER_GAME_MODES, normalizeGameModeInputs } from "./game-modes.ts";
import { normalizeCountryInput } from "./countries.ts";

export const minecraftEditions = ["java", "bedrock"] as const;
export type MinecraftEdition = (typeof minecraftEditions)[number];

const MAX_URL_LENGTH = 2_048;
type ServerUrlField = "websiteUrl" | "storeUrl" | "discordUrl" | "accessFormUrl";

export type RawServerEndpoint = {
  edition: MinecraftEdition;
  host: string;
  port?: number;
};

export type CreateServerInput = {
  name: string;
  description?: string;
  websiteUrl?: string;
  storeUrl?: string;
  discordUrl?: string;
  accessType?: ServerAccessType;
  accessFormUrl?: string;
  accountMode?: ServerAccountMode;
  authMode?: ServerAuthMode;
  gameModes?: string[];
  country?: string;
  host?: string;
  javaPort?: number;
  bedrockPort?: number;
  endpoints?: RawServerEndpoint[];
};

export type UpdateServerInput = CreateServerInput;

export type NormalizedServerEndpoint = {
  edition: MinecraftEdition;
  host: string;
  port: number;
};

export type NormalizedCreateServerInput = {
  name: string;
  description: string | null;
  websiteUrl: string | null;
  storeUrl: string | null;
  discordUrl: string | null;
  accessType: ServerAccessType;
  accessFormUrl: string | null;
  accountMode: ServerAccountMode;
  authMode: ServerAuthMode;
  gameModes: string[];
  country: string;
  host: string;
  endpoints: NormalizedServerEndpoint[];
};

// `parseEnabledPort` turns a cleared field into NaN, so the type error needs a message of its own:
// zod's default ("expected number, received NaN") reads like a crash next to the port input.
const PORT_RANGE_MESSAGE = `Usa un puerto entre ${MINECRAFT_PORT_MIN} y ${MINECRAFT_PORT_MAX}.`;
const portSchema = z
  .number({ error: "Escribe el puerto de esta edición." })
  .int("Escribe el puerto de esta edición.")
  .min(MINECRAFT_PORT_MIN, PORT_RANGE_MESSAGE)
  .max(MINECRAFT_PORT_MAX, PORT_RANGE_MESSAGE);

const endpointSchema = z
  .object({
    edition: z.enum(minecraftEditions),
    host: z.string().trim().min(1).max(253),
    port: portSchema.optional(),
  })
  .strict();

export const createServerInputSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().transform((value) => normalizeServerDescription(value) ?? "").pipe(z.string().max(SERVER_DESCRIPTION_MAX_LENGTH)).optional(),
    websiteUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    storeUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    discordUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    accessType: z.enum(serverAccessTypes).default("open"),
    accessFormUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    accountMode: z.enum(serverAccountModes).default("premium_only"),
    authMode: z.enum(serverAuthModes).default("direct"),
    // Unknown slugs are filtered out by normalizeGameModeInputs, so only the count is a hard error.
    gameModes: z.array(z.string().trim().min(1).max(32)).max(MAX_SERVER_GAME_MODES, `Elige hasta ${MAX_SERVER_GAME_MODES} modos de juego.`).optional(),
    country: z.string().trim().max(8).optional(),
    host: z.string().trim().min(1).max(253).optional(),
    javaPort: portSchema.optional(),
    bedrockPort: portSchema.optional(),
    endpoints: z.array(endpointSchema).min(1).max(2).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const usesSharedHost = input.host !== undefined;
    const usesLegacyEndpoints = input.endpoints !== undefined;
    if (usesSharedHost === usesLegacyEndpoints) {
      ctx.addIssue({
        code: "custom",
        path: ["host"],
        message: "Indica un host compartido y sus puertos.",
      });
    } else if (usesSharedHost && input.javaPort === undefined && input.bedrockPort === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["host"],
        message: "Activa al menos una edición de Minecraft.",
      });
    } else if (input.endpoints) {
      const editions = new Set(input.endpoints.map((endpoint) => endpoint.edition));
      if (editions.size !== input.endpoints.length) {
        ctx.addIssue({
          code: "custom",
          path: ["endpoints"],
          message: "Solo se permite una dirección por edición de Minecraft.",
        });
      }
    }

    if (input.accessType === "open" && input.accessFormUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["accessFormUrl"],
        message: "El formulario de acceso solo está disponible con whitelist.",
      });
    }

    if (input.accountMode === "premium_only" && input.authMode !== "direct") {
      ctx.addIssue({
        code: "custom",
        path: ["authMode"],
        message: "La autenticación para no-premium solo aplica cuando se aceptan cuentas no-premium.",
      });
    }

    if (input.accountMode === "premium_and_non_premium" && input.authMode === "direct") {
      ctx.addIssue({
        code: "custom",
        path: ["authMode"],
        message: "Las cuentas no-premium necesitan un método de autenticación.",
      });
    }
  });

export class ServerInputError extends Error {
  readonly field:
    | "name"
    | "description"
    | "websiteUrl"
    | "storeUrl"
    | "discordUrl"
    | "accessFormUrl"
    | "gameModes"
    | "country"
    | "endpoints"
    | "host"
    | "port";

  constructor(
    message: string,
    field:
      | "name"
      | "description"
      | "websiteUrl"
      | "storeUrl"
      | "discordUrl"
      | "accessFormUrl"
      | "gameModes"
      | "country"
      | "endpoints"
      | "host"
      | "port" = "endpoints",
  ) {
    super(message);
    this.name = "ServerInputError";
    this.field = field;
  }
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Pasting the address the way players type it — with a scheme, or with the port glued on — is the
// usual way this field fails, so each shape gets the message that says what to remove.
function invalidHostError(candidate: string) {
  if (candidate.includes("://")) {
    return new ServerInputError("Escribe solo el dominio o la IP, sin http:// ni https://.", "host");
  }
  if (/^[^:]+:\d+$/.test(candidate)) {
    return new ServerInputError("Escribe solo el dominio o la IP: el puerto va en su propio campo.", "host");
  }
  return new ServerInputError("Escribe un dominio o una IP válidos.", "host");
}

export function normalizeHost(value: string) {
  const candidate = value.trim().replace(/\.$/, "");

  if (!candidate || /[\s/?#@]/.test(candidate) || candidate.includes("://")) {
    throw invalidHostError(candidate);
  }

  const ipCandidate = candidate.replace(/^\[|\]$/g, "");

  if (isIP(ipCandidate) === 6) {
    try {
      const normalized = new URL(`http://[${ipCandidate}]`).hostname;
      return normalized.replace(/^\[|\]$/g, "").toLowerCase();
    } catch {
      throw new ServerInputError("Escribe una dirección IPv6 válida.", "host");
    }
  }

  if (isIP(ipCandidate) === 4) {
    return ipCandidate;
  }

  const ascii = domainToASCII(candidate).toLowerCase().replace(/\.$/, "");
  const labels = ascii.split(".");
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (
    !ascii ||
    ascii.length > 253 ||
    labels.some((label) => !label || !validLabel.test(label))
  ) {
    throw invalidHostError(candidate);
  }

  return ascii;
}

export function isPublicHost(value: string) {
  const candidate = value.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(candidate);

  if (ipVersion !== 0) {
    return isPublicAddress(candidate);
  }

  const hostname = candidate.toLowerCase();
  const blockedSuffixes = [
    ".localhost",
    ".local",
    ".internal",
    ".home.arpa",
  ];
  return (
    hostname.includes(".") &&
    hostname !== "localhost" &&
    !blockedSuffixes.some((suffix) => hostname.endsWith(suffix))
  );
}

export function normalizeHttpUrl(value: string, field: ServerUrlField) {
  const candidate = value.trim();

  if (!candidate) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ServerInputError("Escribe una URL válida.", field);
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new ServerInputError("Escribe una URL pública que empiece por http:// o https://.", field);
  }

  if (field === "discordUrl") {
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "");
    const isInvite =
      (hostname === "discord.gg" && path.length > 1) ||
      (["discord.com", "discordapp.com"].includes(hostname) &&
        path.startsWith("/invite/") &&
        path.length > "/invite/".length);

    if (!isInvite) {
      throw new ServerInputError("Usa un enlace de invitación de Discord (discord.gg/…).", field);
    }
  }

  parsed.hash = "";
  return parsed.toString();
}

export function defaultPortForEdition(edition: MinecraftEdition) {
  return defaultMinecraftPort(edition);
}

export function slugifyServerName(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return slug || "server";
}

export function normalizeCreateServerInput(
  input: CreateServerInput,
): NormalizedCreateServerInput {
  const parsed = createServerInputSchema.parse({
    ...input,
    description: normalizeServerDescription(input.description) ?? undefined,
    websiteUrl: emptyToUndefined(input.websiteUrl),
    storeUrl: emptyToUndefined(input.storeUrl),
    discordUrl: emptyToUndefined(input.discordUrl),
    accessFormUrl: emptyToUndefined(input.accessFormUrl),
  });

  const legacyHosts = parsed.endpoints?.map((endpoint) => normalizeHost(endpoint.host)) ?? [];
  const host = normalizeHost(parsed.host ?? legacyHosts[0] ?? "");
  if (legacyHosts.some((candidate) => candidate !== host)) {
    throw new ServerInputError("Usa el mismo host para Java y Bedrock.", "host");
  }

  const endpoints = parsed.endpoints
    ? parsed.endpoints.map((endpoint) => ({
      edition: endpoint.edition,
      host,
      port: endpoint.port ?? defaultPortForEdition(endpoint.edition),
    }))
    : [
      ...(parsed.javaPort === undefined ? [] : [{ edition: "java" as const, host, port: parsed.javaPort }]),
      ...(parsed.bedrockPort === undefined ? [] : [{ edition: "bedrock" as const, host, port: parsed.bedrockPort }]),
    ];

  if (!isPublicHost(host)) {
    throw new ServerInputError(
      "Usa un dominio o una IP pública: las direcciones locales o privadas no son accesibles para los jugadores.",
      "host",
    );
  }

  const gameModes = normalizeGameModeInputs(parsed.gameModes);
  if (!gameModes.length) {
    throw new ServerInputError(
      "Elige al menos un modo de juego: es como los jugadores encuentran tu servidor en el catálogo.",
      "gameModes",
    );
  }

  const country = normalizeCountryInput(parsed.country);
  if (!country) {
    throw new ServerInputError("Elige el país de la comunidad.", "country");
  }

  return {
    name: parsed.name.replace(/\s+/g, " "),
    description: parsed.description || null,
    websiteUrl: parsed.websiteUrl
      ? normalizeHttpUrl(parsed.websiteUrl, "websiteUrl")
      : null,
    storeUrl: parsed.storeUrl
      ? normalizeHttpUrl(parsed.storeUrl, "storeUrl")
      : null,
    discordUrl: parsed.discordUrl
      ? normalizeHttpUrl(parsed.discordUrl, "discordUrl")
      : null,
    accessType: parsed.accessType,
    accessFormUrl: parsed.accessFormUrl
      ? normalizeHttpUrl(parsed.accessFormUrl, "accessFormUrl")
      : null,
    accountMode: parsed.accountMode,
    authMode: parsed.authMode,
    gameModes,
    country,
    host,
    endpoints,
  };
}

export const normalizeUpdateServerInput = normalizeCreateServerInput;
