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
