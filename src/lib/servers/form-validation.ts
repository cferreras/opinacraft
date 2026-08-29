export type ServerValidationField =
  | "name"
  | "description"
  | "websiteUrl"
  | "storeUrl"
  | "discordUrl"
  | "accessFormUrl"
  | "accessType"
  | "accountMode"
  | "authMode"
  | "gameModes"
  | "country"
  | "endpoints"
  | "publicationStatus";

const endpointFields = new Set(["host", "javaPort", "bedrockPort", "port"]);
const serverFields = new Set<ServerValidationField>([
  "name",
  "description",
  "websiteUrl",
  "storeUrl",
  "discordUrl",
  "accessFormUrl",
  "accessType",
  "accountMode",
  "authMode",
  "gameModes",
  "country",
  "endpoints",
  "publicationStatus",
]);

export function serverValidationField(path: readonly PropertyKey[]): ServerValidationField | null {
  const field = path[0];
  if (typeof field !== "string") return null;
  if (endpointFields.has(field)) return "endpoints";
  return serverFields.has(field as ServerValidationField) ? field as ServerValidationField : null;
}
