export const catalogPath = "/";

const catalogQueryKeys = ["q", "mode", "version", "country", "access", "edition", "status", "sort", "tableSort", "tableDirection", "page"] as const;

export type CatalogQueryInput = Partial<Record<(typeof catalogQueryKeys)[number], string | readonly string[] | undefined>> & Record<string, unknown>;

export function buildCatalogHref(input: CatalogQueryInput) {
  const params = new URLSearchParams();

  for (const key of catalogQueryKeys) {
    const value = input[key];
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (typeof item !== "string") continue;
      const normalized = key === "q" ? item.trim() : item;
      if (normalized) params.append(key, normalized);
    }
  }

  const queryString = params.toString();
  return queryString ? `${catalogPath}?${queryString}` : catalogPath;
}
