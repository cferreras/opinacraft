export type ServerStatus = "online" | "offline" | "unknown";

type ServerEndpoint = {
  edition: "java" | "bedrock";
  playersCurrent: number | null;
  playersMax: number | null;
};

type ServerWithEndpoints = {
  aggregateStatus: ServerStatus;
  endpoints: ReadonlyArray<ServerEndpoint>;
  monitor?: {
    playersCurrent: number | null;
    playersMax: number | null;
  };
};

export function primaryEndpoint<T extends ServerWithEndpoints>(server: T): T["endpoints"][number] | undefined {
  return server.endpoints.find((endpoint) => endpoint.edition === "java") ?? server.endpoints[0];
}

export function statusLabel(status: ServerStatus) {
  if (status === "online") return "En línea";
  if (status === "offline") return "Fuera de línea";
  return "Estado desconocido";
}

export function statusClass(status: ServerStatus) {
  if (status === "online") return "text-success";
  if (status === "offline") return "text-destructive";
  return "text-muted-foreground";
}

export function statusDot(status: ServerStatus) {
  if (status === "online") return "bg-success";
  if (status === "offline") return "bg-destructive";
  return "bg-muted-foreground/40";
}

export function playersLabel(server: ServerWithEndpoints, empty = "—") {
  if (server.monitor) {
    return `${server.monitor.playersCurrent ?? "—"} / ${server.monitor.playersMax ?? "—"}`;
  }
  const endpoint = primaryEndpoint(server);
  if (!endpoint || (endpoint.playersCurrent === null && endpoint.playersMax === null)) return empty;
  return `${endpoint.playersCurrent ?? "—"} / ${endpoint.playersMax ?? "—"}`;
}

export function formatEndpoint(endpoint: {
  edition: "java" | "bedrock";
  host: string;
  port: number;
}) {
  const host = endpoint.host.includes(":") ? `[${endpoint.host}]` : endpoint.host;
  const defaultPort = endpoint.edition === "java" ? 25_565 : 19_132;
  return endpoint.port === defaultPort ? host : `${host}:${endpoint.port}`;
}

export function latencyClass(latency: number | null) {
  if (latency === null) return "text-muted-foreground";
  if (latency <= 60) return "text-success";
  return "text-warning";
}
