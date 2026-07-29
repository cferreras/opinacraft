import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import ipaddr from "ipaddr.js";

import * as z from "zod";

export const minecraftEditions = ["java", "bedrock"] as const;
export type MinecraftEdition = (typeof minecraftEditions)[number];

const MAX_URL_LENGTH = 2_048;

export type RawServerEndpoint = {
  edition: MinecraftEdition;
  host: string;
  port?: number;
};

export type CreateServerInput = {
  name: string;
  description?: string;
  websiteUrl?: string;
  discordUrl?: string;
  endpoints: RawServerEndpoint[];
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
  discordUrl: string | null;
  endpoints: NormalizedServerEndpoint[];
};

const endpointSchema = z
  .object({
    edition: z.enum(minecraftEditions),
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65_535).optional(),
  })
  .strict();

export const createServerInputSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(2_000).optional(),
    websiteUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    discordUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    endpoints: z.array(endpointSchema).min(1).max(2),
  })
  .strict()
  .superRefine((input, ctx) => {
    const editions = new Set(input.endpoints.map((endpoint) => endpoint.edition));

    if (editions.size !== input.endpoints.length) {
      ctx.addIssue({
        code: "custom",
        path: ["endpoints"],
        message: "Only one endpoint per Minecraft edition is allowed.",
      });
    }
  });

export class ServerInputError extends Error {
  readonly field:
    | "name"
    | "description"
    | "websiteUrl"
    | "discordUrl"
    | "endpoints"
    | "host"
    | "port";

  constructor(
    message: string,
    field:
      | "name"
      | "description"
      | "websiteUrl"
      | "discordUrl"
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
    try {
      return ipaddr.parse(candidate).range() === "unicast";
    } catch {
      return false;
    }
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

export function normalizeHttpUrl(value: string, field: "websiteUrl" | "discordUrl") {
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
  return edition === "java" ? 25_565 : 19_132;
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
    description: emptyToUndefined(input.description),
    websiteUrl: emptyToUndefined(input.websiteUrl),
    discordUrl: emptyToUndefined(input.discordUrl),
  });

  const endpoints = parsed.endpoints.map((endpoint) => ({
    edition: endpoint.edition,
    host: normalizeHost(endpoint.host),
    port: endpoint.port ?? defaultPortForEdition(endpoint.edition),
  }));

  for (const endpoint of endpoints) {
    if (!isPublicHost(endpoint.host)) {
      throw new ServerInputError(
        "Use a public Minecraft hostname or IP address.",
        "host",
      );
    }
  }

  return {
    name: parsed.name.replace(/\s+/g, " "),
    description: parsed.description || null,
    websiteUrl: parsed.websiteUrl
      ? normalizeHttpUrl(parsed.websiteUrl, "websiteUrl")
      : null,
    discordUrl: parsed.discordUrl
      ? normalizeHttpUrl(parsed.discordUrl, "discordUrl")
      : null,
    endpoints,
  };
}

export const normalizeUpdateServerInput = normalizeCreateServerInput;
