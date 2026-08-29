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

const countriesByCode = new Map(serverCountries.map((country) => [country.code, country]));

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

/** Form input: an unknown or empty country clears the field instead of failing the save. */
export function normalizeCountryInput(value: string | null | undefined) {
  const code = value?.trim().toLowerCase();
  return isServerCountryCode(code) ? code : null;
}
