import {
  MINECRAFT_PORT_MAX,
  MINECRAFT_PORT_MIN,
  type MinecraftEdition,
} from "./endpoint-fields.ts";
import { formatEndpoint } from "./format.ts";

export const SERVER_NAME_MIN_LENGTH = 3;

const draftEditions = ["java", "bedrock"] as const;

export type ServerDraft = {
  name: string;
  host: string;
  javaEnabled: boolean;
  javaPort: string;
  bedrockEnabled: boolean;
  bedrockPort: string;
  logoName: string | null;
};

export type ServerDraftSectionId = "identity" | "logo" | "endpoints" | "access";

export type ServerDraftSection = {
  id: ServerDraftSectionId;
  number: string;
  title: string;
  optional: boolean;
  complete: boolean;
};

function draftEditionEnabled(draft: ServerDraft, edition: MinecraftEdition) {
  return edition === "java" ? draft.javaEnabled : draft.bedrockEnabled;
}

function draftEditionPort(draft: ServerDraft, edition: MinecraftEdition) {
  const port = Number((edition === "java" ? draft.javaPort : draft.bedrockPort).trim());
  return Number.isInteger(port) && port >= MINECRAFT_PORT_MIN && port <= MINECRAFT_PORT_MAX ? port : null;
}

export function serverDraftAddresses(draft: ServerDraft) {
  const host = draft.host.trim();
  if (!host) return [];

  return draftEditions.flatMap((edition) => {
    const port = draftEditionEnabled(draft, edition) ? draftEditionPort(draft, edition) : null;
    return port === null ? [] : [{ edition, address: formatEndpoint({ edition, host, port }) }];
  });
}

export function serverDraftRequiredProgress(draft: ServerDraft) {
  const requirements = [
    draft.name.trim().length >= SERVER_NAME_MIN_LENGTH,
    draft.host.trim().length > 0,
    serverDraftAddresses(draft).length > 0,
  ];

  return { completed: requirements.filter(Boolean).length, total: requirements.length };
}

export function serverDraftSections(draft: ServerDraft): ServerDraftSection[] {
  return [
    { id: "identity", number: "01", title: "Identidad y enlaces", optional: false, complete: draft.name.trim().length >= SERVER_NAME_MIN_LENGTH },
    { id: "logo", number: "02", title: "Logo del servidor", optional: true, complete: draft.logoName !== null },
    { id: "endpoints", number: "03", title: "Conexión del servidor", optional: false, complete: draft.host.trim().length > 0 && serverDraftAddresses(draft).length > 0 },
    { id: "access", number: "04", title: "Acceso de jugadores", optional: false, complete: true },
  ];
}
