import type { ManagedServer } from "./queries";

export type ServerManageFormData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  storeUrl: string | null;
  discordUrl: string | null;
  accessType: ManagedServer["accessType"];
  accessFormUrl: string | null;
  accountMode: ManagedServer["accountMode"];
  authMode: ManagedServer["authMode"];
  gameModes: string[];
  country: string | null;
  publicationStatus: ManagedServer["publicationStatus"];
  endpoints: Array<{ edition: "java" | "bedrock"; host: string; port: number }>;
  role: ManagedServer["role"];
};

export function toServerManageFormData(
  server: Pick<
    ManagedServer,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "websiteUrl"
    | "storeUrl"
    | "discordUrl"
    | "accessType"
    | "accessFormUrl"
    | "accountMode"
    | "authMode"
    | "gameModes"
    | "country"
    | "publicationStatus"
    | "endpoints"
    | "role"
  >,
): ServerManageFormData {
  return {
    id: server.id,
    slug: server.slug,
    name: server.name,
    description: server.description,
    websiteUrl: server.websiteUrl,
    storeUrl: server.storeUrl,
    discordUrl: server.discordUrl,
    accessType: server.accessType,
    accessFormUrl: server.accessFormUrl,
    accountMode: server.accountMode,
    authMode: server.authMode,
    gameModes: [...server.gameModes],
    country: server.country,
    publicationStatus: server.publicationStatus,
    endpoints: server.endpoints.map(({ edition, host, port }) => ({ edition, host, port })),
    role: server.role,
  };
}
