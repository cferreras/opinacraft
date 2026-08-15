import type { ManagedServer } from "./queries";

export type ServerManageFormData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  storeUrl: string | null;
  discordUrl: string | null;
  tags: Array<{ label: string; slug: string }>;
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
    | "tags"
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
    tags: server.tags.map(({ label, slug }) => ({ label, slug })),
    publicationStatus: server.publicationStatus,
    endpoints: server.endpoints.map(({ edition, host, port }) => ({ edition, host, port })),
    role: server.role,
  };
}
