export type MonitorAvailabilityState = {
  publicationStatus: "draft" | "published" | "hidden";
  moderationStatus: "active" | "blocked";
  availabilityHiddenAt: Date | null;
  healthStatus: "unknown" | "online" | "offline";
  lastCheckedAt: Date | null;
  lastOnlineAt: Date | null;
};

export type AvailabilityTransition = "hidden" | "restored";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getAvailabilityTransition(state: MonitorAvailabilityState, now = new Date()): AvailabilityTransition | null {
  if (state.publicationStatus !== "published" || state.moderationStatus !== "active" || !state.lastCheckedAt) return null;

  const cadenceMinutes = state.availabilityHiddenAt ? 60 : 15;
  const isFresh = now.getTime() - state.lastCheckedAt.getTime() <= cadenceMinutes * 2 * 60_000;
  if (!isFresh) return null;

  if (state.availabilityHiddenAt && state.healthStatus === "online") return "restored";
  if (!state.availabilityHiddenAt && state.healthStatus === "offline") {
    const cutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
    if (!state.lastOnlineAt || state.lastOnlineAt <= cutoff) return "hidden";
  }

  return null;
}
