export function formatEndpoint(endpoint: {
  edition: "java" | "bedrock";
  host: string;
  port: number;
}) {
  const host = endpoint.host.includes(":") ? `[${endpoint.host}]` : endpoint.host;
  const defaultPort = endpoint.edition === "java" ? 25_565 : 19_132;
  return endpoint.port === defaultPort ? host : `${host}:${endpoint.port}`;
}
