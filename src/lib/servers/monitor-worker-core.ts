import { selectCanonicalEndpoint } from "./monitor-scheduling";

export type CanonicalMonitorEndpoint = {
  edition: "java" | "bedrock";
  verificationStatus: "unverified" | "verified";
  host: string;
  port: number;
};

export type CanonicalProbeResponse = {
  status: "online" | "offline" | "unknown";
  failureCode?: "unreachable" | "timeout" | "invalid_response" | "dns_error" | "blocked_target" | "monitor_error" | null;
  playersCurrent: number | null;
  playersMax: number | null;
  version: string | null;
  latencyMs: number | null;
};

export type CanonicalMonitorObservation = CanonicalProbeResponse & {
  serverId: string;
  scheduledAt: Date;
  observedAt: Date;
  probeEdition: "java" | "bedrock";
};

export async function runCanonicalMonitorJob({
  serverId,
  scheduledAt,
  endpoints,
  probe,
  persist,
}: {
  serverId: string;
  scheduledAt: Date;
  endpoints: readonly CanonicalMonitorEndpoint[];
  probe: (endpoint: CanonicalMonitorEndpoint) => Promise<CanonicalProbeResponse>;
  persist: (observation: CanonicalMonitorObservation) => Promise<void>;
}) {
  const endpoint = selectCanonicalEndpoint(endpoints);
  if (!endpoint) throw new Error("No verified endpoint available for monitor job.");

  const response = await probe(endpoint);
  const observedAt = new Date();
  const observation: CanonicalMonitorObservation = {
    ...response,
    serverId,
    scheduledAt,
    observedAt,
    probeEdition: endpoint.edition,
  };
  await persist(observation);
  return observation;
}
