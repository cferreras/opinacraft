import { and, eq, type SQL } from "drizzle-orm";

import type { PublicServerSort } from "@/lib/servers/queries";
import { servers } from "@/schema";

export const catalogAccessValues = ["premium", "non-premium", "semi-premium", "whitelist"] as const;
export type CatalogAccessFilter = (typeof catalogAccessValues)[number];

const catalogAccessCriteriaByValue = {
  premium: {
    accessType: "open",
    accountMode: "premium_only",
    authMode: "direct",
  },
  "non-premium": {
    accessType: "open",
    accountMode: "premium_and_non_premium",
    authMode: "password_all",
  },
  "semi-premium": {
    accessType: "open",
    accountMode: "premium_and_non_premium",
    authMode: "password_non_premium",
  },
  whitelist: { accessType: "whitelist" },
} as const satisfies Record<CatalogAccessFilter, {
  accessType: "open" | "whitelist";
  accountMode?: "premium_only" | "premium_and_non_premium";
  authMode?: "direct" | "password_non_premium" | "password_all";
}>;

export function parseCatalogAccessParam(value: string | undefined): CatalogAccessFilter | undefined {
  return catalogAccessValues.find((option) => option === value);
}

export function catalogAccessCriteria(value: CatalogAccessFilter) {
  return catalogAccessCriteriaByValue[value];
}

export function catalogAccessCondition(value: CatalogAccessFilter): SQL {
  const criteria = catalogAccessCriteria(value);

  return and(
    eq(servers.accessType, criteria.accessType),
    "accountMode" in criteria ? eq(servers.accountMode, criteria.accountMode) : undefined,
    "authMode" in criteria ? eq(servers.authMode, criteria.authMode) : undefined,
  )!;
}

// Shared by the catalog filter bar and by the page that reads the query string back, so a label is
// written once and the active-filter chips always match the control the visitor used.
export const catalogSortOptions: ReadonlyArray<{ value: PublicServerSort; label: string }> = [
  { value: "rating", label: "Mejor valorados" },
  { value: "players", label: "Más jugadores" },
  { value: "recent", label: "Más recientes" },
];

export const catalogEditionOptions: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Todas" },
  { value: "java", label: "Java" },
  { value: "bedrock", label: "Bedrock" },
];

export const catalogStatusOptions: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  { value: "online", label: "En línea" },
  { value: "offline", label: "Fuera de línea" },
  { value: "unknown", label: "Sin datos" },
];

export const catalogAccessOptions: ReadonlyArray<{ value: "" | CatalogAccessFilter; label: string }> = [
  { value: "", label: "Todos" },
  { value: "premium", label: "Solo premium" },
  { value: "non-premium", label: "No-premium" },
  { value: "semi-premium", label: "Semi-premium" },
  { value: "whitelist", label: "Whitelist" },
];
