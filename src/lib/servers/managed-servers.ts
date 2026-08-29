import { formatEndpoint, primaryEndpoint } from "@/lib/servers/format";
import type { ManagedServer } from "@/lib/servers/queries";

export const managedServerFilters = ["all", "online", "attention", "draft"] as const;
export type ManagedServerFilter = (typeof managedServerFilters)[number];

export const managedServerSorts = ["status", "name", "players", "recent"] as const;
export type ManagedServerSort = (typeof managedServerSorts)[number];

export type ManagedServerNoticeTone = "danger" | "warning" | "neutral";

export type ManagedServerNotice = {
  id: string;
  tone: ManagedServerNoticeTone;
  serverName: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
};

export function isManagedServerFilter(value: string | undefined): value is ManagedServerFilter {
  return value !== undefined && managedServerFilters.includes(value as ManagedServerFilter);
}

export function isManagedServerSort(value: string | undefined): value is ManagedServerSort {
  return value !== undefined && managedServerSorts.includes(value as ManagedServerSort);
}

export function formatElapsed(from: Date | null, now = new Date()) {
  if (!from) return null;
  const minutes = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return "hace unos segundos";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

export function monitorCheckedLabel(server: ManagedServer) {
  return formatElapsed(server.monitor.lastUpdatedAt) ?? "sin comprobar";
}

function serverAddress(server: ManagedServer) {
  const endpoint = primaryEndpoint(server);
  return endpoint ? formatEndpoint(endpoint) : server.slug;
}

export function managedServerNotices(server: ManagedServer): ManagedServerNotice[] {
  const notices: ManagedServerNotice[] = [];
  const manageHref = `/servers/${server.slug}/manage`;

  if (server.aggregateStatus === "offline") {
    const down = formatElapsed(server.monitor.offlineSince ?? server.monitor.lastOnlineAt);
    notices.push({
      id: `${server.id}:offline`,
      tone: "danger",
      serverName: server.name,
      title: down ? `${server.name} está fuera de línea desde ${down}` : `${server.name} está fuera de línea`,
      detail: server.monitor.consecutiveFailures > 0
        ? `${server.monitor.consecutiveFailures} comprobaciones fallidas seguidas en ${serverAddress(server)}.`
        : `El monitor no obtiene respuesta en ${serverAddress(server)}.`,
      actionLabel: "Revisar monitor",
      href: manageHref,
    });
  }

  if (server.verificationStatus !== "verified") {
    notices.push({
      id: `${server.id}:verification`,
      tone: "warning",
      serverName: server.name,
      title: `${server.name} no ha verificado su propiedad`,
      detail: "La ficha se publica sin distintivo verificado hasta completar la verificación.",
      actionLabel: "Verificar propiedad",
      href: `${manageHref}#verification`,
    });
  }

  if (server.publicationStatus === "draft") {
    notices.push({
      id: `${server.id}:draft`,
      tone: "neutral",
      serverName: server.name,
      title: `${server.name} sigue en borrador`,
      detail: "Solo tú puedes verlo. Completa su ficha para publicarlo en el directorio.",
      actionLabel: "Completar ficha",
      href: manageHref,
    });
  }

  return notices;
}

export function collectManagedServerNotices(servers: ManagedServer[]) {
  return servers.flatMap((server) => managedServerNotices(server));
}

export function summarizeManagedServers(servers: ManagedServer[]) {
  let published = 0;
  let hidden = 0;
  let draft = 0;
  let online = 0;
  let offline = 0;
  let unknown = 0;
  let playersCurrent = 0;
  let playersMax = 0;

  for (const server of servers) {
    if (server.publicationStatus === "published") published += 1;
    else if (server.publicationStatus === "hidden") hidden += 1;
    else draft += 1;

    if (server.aggregateStatus === "online") online += 1;
    else if (server.aggregateStatus === "offline") offline += 1;
    else unknown += 1;

    if (server.aggregateStatus === "online" && server.monitor.playersCurrent !== null) playersCurrent += server.monitor.playersCurrent;
    if (server.monitor.playersMax !== null) playersMax += server.monitor.playersMax;
  }

  return {
    total: servers.length,
    published,
    hidden,
    draft,
    online,
    offline,
    unknown,
    playersCurrent,
    playersMax,
    attention: collectManagedServerNotices(servers).length,
  };
}

export function filterManagedServers(servers: ManagedServer[], { query = "", filter = "all" as ManagedServerFilter } = {}) {
  const needle = query.trim().toLowerCase();

  return servers.filter((server) => {
    if (needle) {
      const haystack = [server.name, server.slug, ...server.endpoints.map((endpoint) => formatEndpoint(endpoint))].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filter === "online") return server.aggregateStatus === "online";
    if (filter === "draft") return server.publicationStatus === "draft";
    if (filter === "attention") return managedServerNotices(server).length > 0;
    return true;
  });
}

const statusWeight: Record<ManagedServer["aggregateStatus"], number> = { offline: 0, unknown: 1, online: 2 };

export function sortManagedServers(servers: ManagedServer[], sort: ManagedServerSort) {
  const sorted = [...servers];

  switch (sort) {
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
    case "players":
      return sorted.sort((a, b) => (b.monitor.playersCurrent ?? -1) - (a.monitor.playersCurrent ?? -1) || a.name.localeCompare(b.name, "es"));
    case "recent":
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "status":
      return sorted.sort((a, b) =>
        managedServerNotices(b).length - managedServerNotices(a).length
        || statusWeight[a.aggregateStatus] - statusWeight[b.aggregateStatus]
        || a.name.localeCompare(b.name, "es"));
  }
}

export function managedServerFilterCounts(servers: ManagedServer[]) {
  return {
    all: servers.length,
    online: servers.filter((server) => server.aggregateStatus === "online").length,
    attention: servers.filter((server) => managedServerNotices(server).length > 0).length,
    draft: servers.filter((server) => server.publicationStatus === "draft").length,
  } satisfies Record<ManagedServerFilter, number>;
}
