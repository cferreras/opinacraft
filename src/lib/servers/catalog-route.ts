export const catalogPath = "/";

/**
 * `relevancia` is the odd one out: every other key narrows the catalog, and that one changes who
 * decides the order. With `relevancia=ia`, `q` stops being text to match and becomes the description
 * each server is judged against.
 */
const catalogQueryKeys = ["q", "relevancia", "mode", "version", "country", "access", "edition", "status", "sort", "tableSort", "tableDirection", "page"] as const;

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

/**
 * A query string as {@link buildCatalogHref} wants it. `mode` may appear more than once, so this
 * cannot be `Object.fromEntries`: that keeps the last value and quietly drops the rest of the
 * visitor's filter.
 */
export function catalogInputFrom(params: URLSearchParams): CatalogQueryInput {
  const input: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    input[key] = values.length > 1 ? values : values[0];
  }
  return input;
}
