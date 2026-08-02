export type ServerStatus = "online" | "offline" | "unknown";

type ServerEndpoint = {
  edition: "java" | "bedrock";
  playersCurrent: number | null;
  playersMax: number | null;
};

type ServerWithEndpoints = {
  aggregateStatus: ServerStatus;
  endpoints: ReadonlyArray<ServerEndpoint>;
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
  if (status === "online") return "text-[#0e9a55]";
  if (status === "offline") return "text-[#d83a42]";
  return "text-[#7c8799]";
}

export function statusDot(status: ServerStatus) {
  if (status === "online") return "bg-[#0e9a55]";
  if (status === "offline") return "bg-[#d83a42]";
  return "bg-[#adb6c2]";
}

export function playersLabel(server: ServerWithEndpoints, empty = "—") {
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
  if (latency === null) return "text-[#7c8799]";
  if (latency <= 60) return "text-[#0e9a55]";
  return "text-[#e48b18]";
}
