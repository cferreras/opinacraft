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

export function isCatalogAccessFilter(value: string | undefined): value is CatalogAccessFilter {
  return value !== undefined && catalogAccessValues.includes(value as CatalogAccessFilter);
}

/**
 * What a visitor asks for, as opposed to what the catalog stores.
 *
 * The two differ in one place that matters: `non-premium` and `semi-premium` both accept accounts
 * without a licence — they differ only in whether the premium players also type a password. So
 * "servidores no premium" is one intent covering two stored values, and answering it with either
 * one alone would hide servers that do exactly what was asked.
 *
 * Nobody types "semi-premium" into a search box, which is why it is not an intent of its own; it
 * remains pickable in the filter bar, where the distinction is visible and deliberate.
 */
export const catalogAccessIntents = [
  { code: "premium", label: "Solo premium", values: ["premium"] },
  { code: "no-premium", label: "Acepta no-premium", values: ["non-premium", "semi-premium"] },
  { code: "whitelist", label: "Whitelist", values: ["whitelist"] },
] as const satisfies ReadonlyArray<{ code: string; label: string; values: readonly CatalogAccessFilter[] }>;

export type CatalogAccessIntent = (typeof catalogAccessIntents)[number]["code"];

const accessIntentsByCode = new Map(catalogAccessIntents.map((intent) => [intent.code as string, intent]));

export function isCatalogAccessIntent(value: string | undefined): value is CatalogAccessIntent {
  return value !== undefined && accessIntentsByCode.has(value);
}

/** The stored values an intent covers, in the catalog's own order. */
export function accessIntentValues(code: string): CatalogAccessFilter[] {
  const intent = accessIntentsByCode.get(code);
  if (!intent) return [];
  const covered = new Set<string>(intent.values);
  return catalogAccessValues.filter((value) => covered.has(value));
}

export function accessIntentLabel(code: string) {
  return accessIntentsByCode.get(code)?.label ?? code;
}

/** The intent a selection is exactly, so two stored values can be shown and removed as one chip. */
export function matchedAccessIntent(values: readonly string[]) {
  if (values.length === 0) return null;
  const selected = new Set(values);
  return catalogAccessIntents.find((intent) =>
    intent.values.length === selected.size && intent.values.every((value) => selected.has(value))
  ) ?? null;
}

/**
 * `?access=` may repeat for the same reason `?mode=` and `?country=` may: see the intents above.
 * An intent code is accepted in the same parameter and expanded here, so `?access=no-premium` says
 * what was asked for and still reaches the database as the two values that answer it.
 */
export function parseCatalogAccessParams(value: string | readonly string[] | undefined): CatalogAccessFilter[] {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value as string];
  const selected = new Set<string>();

  for (const entry of values.map((raw) => raw.trim().toLowerCase())) {
    if (isCatalogAccessFilter(entry)) selected.add(entry);
    // `premium` is both a stored value and an intent naming only itself, so the branch above wins
    // and this one only ever expands the intents that cover more than one value.
    else if (accessIntentsByCode.has(entry)) for (const value of accessIntentValues(entry)) selected.add(value);
  }

  return catalogAccessValues.filter((option) => selected.has(option));
}

/** The inverse: a selection that is exactly an intent is written back as that intent. */
export function accessParamValues(values: readonly string[]): string[] {
  const intent = matchedAccessIntent(values);
  return intent ? [intent.code] : [...values];
}

/**
 * The editions a server can be reached on. The picker has carried these two forever; the closed
 * list exists so the search pipeline can validate an inferred edition against the same source the
 * query string is parsed from, rather than repeating the string comparison in four places.
 */
export const catalogEditions = ["java", "bedrock"] as const;
export type CatalogEdition = (typeof catalogEditions)[number];

export function isCatalogEdition(value: string | undefined): value is CatalogEdition {
  return value !== undefined && catalogEditions.includes(value as CatalogEdition);
}

export function parseCatalogEditionParam(value: string | undefined): CatalogEdition | undefined {
  const edition = value?.trim().toLowerCase();
  return isCatalogEdition(edition) ? edition : undefined;
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
