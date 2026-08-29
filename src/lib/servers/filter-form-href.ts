export type FilterFormHrefOptions = {
  action: string;
  entries: Iterable<[string, FormDataEntryValue]>;
  clearFields?: readonly string[];
  keepPage?: string | null;
};

// Turns the catalog filter form into the href the router should visit, so a filter change is a
// client navigation instead of the full document reload a native GET submit would trigger.
export function buildFilterFormHref({ action, entries, clearFields, keepPage }: FilterFormHrefOptions) {
  const params = new URLSearchParams();
  const cleared = new Set(clearFields ?? []);
  for (const [key, value] of entries) {
    if (typeof value !== "string" || cleared.has(key)) continue;
    const normalized = key === "q" ? value.trim() : value;
    if (normalized) params.append(key, normalized);
  }
  params.delete("page");
  if (keepPage) params.set("page", keepPage);
  const queryString = params.toString();
  return queryString ? `${action}?${queryString}` : action;
}
