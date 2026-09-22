/**
 * Where the community plays from. Not the datacenter location: an owner in Madrid renting a
 * German host still answers "España", because visitors use this to find people in their timezone
 * and their slang, not to guess the ping.
 *
 * The list is the Spanish-speaking market OpinaCraft serves plus an explicit "Global" escape
 * hatch, instead of the ~250 ISO entries that would leave the picker mostly empty. Codes are
 * ISO-3166 alpha-2 lowercased so widening the list later stays a data change; `global` is the one
 * deliberate non-ISO value.
 */
export type ServerCountry = {
  code: string;
  label: string;
  flag: string;
};

export const serverCountries: readonly ServerCountry[] = [
  { code: "es", label: "España", flag: "🇪🇸" },
  { code: "mx", label: "México", flag: "🇲🇽" },
  { code: "ar", label: "Argentina", flag: "🇦🇷" },
  { code: "cl", label: "Chile", flag: "🇨🇱" },
  { code: "co", label: "Colombia", flag: "🇨🇴" },
  { code: "pe", label: "Perú", flag: "🇵🇪" },
  { code: "ve", label: "Venezuela", flag: "🇻🇪" },
  { code: "ec", label: "Ecuador", flag: "🇪🇨" },
  { code: "uy", label: "Uruguay", flag: "🇺🇾" },
  { code: "bo", label: "Bolivia", flag: "🇧🇴" },
  { code: "py", label: "Paraguay", flag: "🇵🇾" },
  { code: "cr", label: "Costa Rica", flag: "🇨🇷" },
  { code: "pa", label: "Panamá", flag: "🇵🇦" },
  { code: "do", label: "Rep. Dominicana", flag: "🇩🇴" },
  { code: "gt", label: "Guatemala", flag: "🇬🇹" },
  { code: "hn", label: "Honduras", flag: "🇭🇳" },
  { code: "sv", label: "El Salvador", flag: "🇸🇻" },
  { code: "ni", label: "Nicaragua", flag: "🇳🇮" },
  { code: "pr", label: "Puerto Rico", flag: "🇵🇷" },
  { code: "us", label: "Estados Unidos", flag: "🇺🇸" },
  { code: "global", label: "Global / Internacional", flag: "🌍" },
] as const;

/**
 * Groups of countries a visitor names with one word.
 *
 * "servidores latinos" is one of the most common things typed into this box, and it is not a
 * country: read as one it has nowhere to land except `global`, whose own label says
 * "Internacional" — so the search used to answer a regional question with the opposite of one.
 *
 * A region is not a filter of its own. It expands into the country codes it covers before it
 * reaches the catalog, so `?country=` stays the single contract the database answers and a region
 * can be widened later without a migration. Spain is deliberately outside `latam`: someone asking
 * for Latin American communities is not asking for Iberian ones.
 */
export type ServerRegion = {
  code: string;
  label: string;
  countries: readonly string[];
};

export const serverRegions: readonly ServerRegion[] = [
  {
    code: "latam",
    label: "Latinoamérica",
    countries: ["mx", "ar", "cl", "co", "pe", "ve", "ec", "uy", "bo", "py", "cr", "pa", "do", "gt", "hn", "sv", "ni", "pr"],
  },
] as const;

const countriesByCode = new Map(serverCountries.map((country) => [country.code, country]));
const regionsByCode = new Map(serverRegions.map((region) => [region.code, region]));

export function isServerCountryCode(value: string | undefined): value is string {
  return value !== undefined && countriesByCode.has(value);
}

export function findServerCountry(code: string | null | undefined) {
  return code ? countriesByCode.get(code) ?? null : null;
}

export function serverCountryLabel(code: string) {
  return countriesByCode.get(code)?.label ?? code;
}

export function parseCountryParam(value: string | undefined) {
  const code = value?.trim().toLowerCase();
  return isServerCountryCode(code) ? code : undefined;
}

export function isServerRegionCode(value: string | undefined): value is string {
  return value !== undefined && regionsByCode.has(value);
}

export function findServerRegion(code: string | null | undefined) {
  return code ? regionsByCode.get(code) ?? null : null;
}

/** The countries a region covers, in catalog order, or nothing for a code we do not know. */
export function regionCountries(code: string): string[] {
  const region = regionsByCode.get(code);
  if (!region) return [];
  const covered = new Set(region.countries);
  return serverCountries.filter((country) => covered.has(country.code)).map((country) => country.code);
}

/**
 * `?country=` may repeat, read as "any of these", for the same reason `?mode=` may: one word can
 * name eighteen countries. A region code is accepted in the same parameter and expanded here, so
 * "¿qué países?" has exactly one answer downstream and the URL stays `?country=latam` rather
 * than eighteen repetitions of itself.
 *
 * Unknown codes are dropped rather than rejected, like every other facet parser, so a stale open
 * tab degrades to a wider result set instead of an error.
 */
export function parseCountryParams(value: string | readonly string[] | undefined): string[] {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value as string];
  const selected = new Set<string>();

  for (const entry of values.map((raw) => raw.trim().toLowerCase())) {
    if (countriesByCode.has(entry)) selected.add(entry);
    else if (regionsByCode.has(entry)) for (const code of regionCountries(entry)) selected.add(code);
  }

  return serverCountries.filter((country) => selected.has(country.code)).map((country) => country.code);
}

/**
 * The inverse: what to write into `?country=` for a selection. A set that is exactly a region is
 * written as that region, which is both shorter and what the visitor asked for.
 */
export function countryParamValues(codes: readonly string[]): string[] {
  const region = matchedServerRegion(codes);
  return region ? [region.code] : [...codes];
}

/**
 * The region a selection is exactly, if any — so eighteen `?country=` values can be shown and
 * removed as one "Latinoamérica" chip instead of eighteen.
 */
export function matchedServerRegion(codes: readonly string[]): ServerRegion | null {
  if (codes.length < 2) return null;
  const selected = new Set(codes);
  return serverRegions.find((region) =>
    region.countries.length === selected.size && region.countries.every((code) => selected.has(code))
  ) ?? null;
}

/** What to call a country selection in a chip: the region when it is one, else the countries. */
export function serverCountriesLabel(codes: readonly string[]): string {
  const region = matchedServerRegion(codes);
  if (region) return region.label;
  return codes.map((code) => serverCountryLabel(code)).join(", ");
}

/** Form input: an unknown or empty country clears the field instead of failing the save. */
export function normalizeCountryInput(value: string | null | undefined) {
  const code = value?.trim().toLowerCase();
  return isServerCountryCode(code) ? code : null;
}
