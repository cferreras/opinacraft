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
  tags?: string[];
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
  tags: string[];
  host: string;
  endpoints: NormalizedServerEndpoint[];
};

const endpointSchema = z
  .object({
    edition: z.enum(minecraftEditions),
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(MINECRAFT_PORT_MIN, "Use a public port between 1024 and 65535.").max(MINECRAFT_PORT_MAX).optional(),
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
    tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    host: z.string().trim().min(1).max(253).optional(),
    javaPort: z.number().int().min(MINECRAFT_PORT_MIN, "Use a public port between 1024 and 65535.").max(MINECRAFT_PORT_MAX).optional(),
    bedrockPort: z.number().int().min(MINECRAFT_PORT_MIN, "Use a public port between 1024 and 65535.").max(MINECRAFT_PORT_MAX).optional(),
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
        message: "Provide one shared host and its ports.",
      });
    } else if (usesSharedHost && input.javaPort === undefined && input.bedrockPort === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["host"],
        message: "Enable at least one Minecraft edition.",
      });
    } else if (input.endpoints) {
      const editions = new Set(input.endpoints.map((endpoint) => endpoint.edition));
      if (editions.size !== input.endpoints.length) {
        ctx.addIssue({
          code: "custom",
          path: ["endpoints"],
          message: "Only one endpoint per Minecraft edition is allowed.",
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

export function normalizeHost(value: string) {
  const candidate = value.trim().replace(/\.$/, "");

  if (!candidate || /[\s/?#@]/.test(candidate) || candidate.includes("://")) {
    throw new ServerInputError("Enter a valid Minecraft host.", "host");
  }

  const ipCandidate = candidate.replace(/^\[|\]$/g, "");

  if (isIP(ipCandidate) === 6) {
    try {
      const normalized = new URL(`http://[${ipCandidate}]`).hostname;
      return normalized.replace(/^\[|\]$/g, "").toLowerCase();
    } catch {
      throw new ServerInputError("Enter a valid IPv6 address.", "host");
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
    throw new ServerInputError("Enter a valid Minecraft host.", "host");
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
    throw new ServerInputError("Enter a valid URL.", field);
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new ServerInputError("Enter a valid public HTTP(S) URL.", field);
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
      throw new ServerInputError("Use a Discord invitation URL.", field);
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
    throw new ServerInputError("Use the same host for Java and Bedrock.", "host");
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
      "Use a public Minecraft hostname or IP address.",
      "host",
    );
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
    tags: parsed.tags ?? [],
    host,
    endpoints,
  };
}

export const normalizeUpdateServerInput = normalizeCreateServerInput;
