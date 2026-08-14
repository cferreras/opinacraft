export type MonitorPublicationState = {
  publicationStatus: "draft" | "published" | "hidden";
  moderationStatus: "active" | "blocked";
  availabilityHiddenAt: Date | null;
  hasVerifiedEndpoint: boolean;
};

export type MonitorFreshness = "fresh" | "stale" | "never";

export const PUBLIC_MONITOR_CADENCE_MINUTES = 15;
export const LOW_PRIORITY_MONITOR_CADENCE_MINUTES = 60;

export function getMonitorCadenceMinutes(state: MonitorPublicationState) {
  if (!state.hasVerifiedEndpoint) return null;
  if (
    state.publicationStatus === "published" &&
    state.moderationStatus === "active" &&
    state.availabilityHiddenAt === null
  ) {
    return PUBLIC_MONITOR_CADENCE_MINUTES;
  }
  return LOW_PRIORITY_MONITOR_CADENCE_MINUTES;
}

export function selectCanonicalEndpoint<T extends {
  edition: "java" | "bedrock";
  verificationStatus: "unverified" | "verified";
}>(endpoints: readonly T[]) {
  return endpoints.find((endpoint) => endpoint.edition === "java" && endpoint.verificationStatus === "verified")
    ?? endpoints.find((endpoint) => endpoint.edition === "bedrock" && endpoint.verificationStatus === "verified")
    ?? null;
}

export function getMonitorFreshness(lastUpdatedAt: Date | null, cadenceMinutes: number, now = new Date()): MonitorFreshness {
  if (!lastUpdatedAt) return "never";
  return now.getTime() - lastUpdatedAt.getTime() <= cadenceMinutes * 2 * 60_000 ? "fresh" : "stale";
}

export function getMonitorRetryDelayMs(attempt: number) {
  return [60_000, 300_000, 900_000][attempt - 1] ?? null;
}
