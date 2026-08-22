export type MonitorCandidate = {
  id: string;
  status: "online" | "offline" | "unknown";
  players: number | null;
  latency: number | null;
  version: string | null;
  checkedAt: string | null;
};

export type MonitorCatalogQuery = {
  status?: MonitorCandidate["status"];
  sort: "catalog" | "players" | "availability" | "checkedAt" | "latency" | "version";
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

function compareNullableNumber(a: number | null, b: number | null, direction: "asc" | "desc") {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * (direction === "asc" ? 1 : -1);
}

export function orderMonitorCandidates(candidates: readonly MonitorCandidate[], query: MonitorCatalogQuery) {
  const filtered = query.status ? candidates.filter((candidate) => candidate.status === query.status) : [...candidates];
  const ordered = filtered.sort((a, b) => {
    let result = 0;
    if (query.sort === "players") result = compareNullableNumber(a.players, b.players, query.direction);
    if (query.sort === "latency") result = compareNullableNumber(a.latency, b.latency, query.direction);
    if (query.sort === "checkedAt") result = compareNullableNumber(a.checkedAt ? Date.parse(a.checkedAt) : null, b.checkedAt ? Date.parse(b.checkedAt) : null, query.direction);
    if (query.sort === "availability") {
      const rank = { online: 0, offline: 1, unknown: 2 } as const;
      result = (rank[a.status] - rank[b.status]) * (query.direction === "asc" ? 1 : -1);
    }
    if (query.sort === "version") {
      if (a.version === null && b.version !== null) result = 1;
      else if (a.version !== null && b.version === null) result = -1;
      else result = (a.version ?? "").localeCompare(b.version ?? "") * (query.direction === "asc" ? 1 : -1);
    }
    return result || (query.sort === "catalog" ? 0 : a.id.localeCompare(b.id));
  });
  const start = Math.max(0, (query.page - 1) * query.pageSize);
  return { ids: ordered.slice(start, start + query.pageSize).map((candidate) => candidate.id), totalCount: ordered.length };
}
