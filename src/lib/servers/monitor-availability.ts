import {
  LOW_PRIORITY_MONITOR_CADENCE_MINUTES,
  PUBLIC_MONITOR_CADENCE_MINUTES,
} from "./monitor-scheduling";

export type MonitorAvailabilityState = {
  publicationStatus: "draft" | "published" | "hidden";
  moderationStatus: "active" | "blocked";
  availabilityHiddenAt: Date | null;
  healthStatus: "unknown" | "online" | "offline";
  lastCheckedAt: Date | null;
  lastOnlineAt: Date | null;
  createdAt: Date;
};

export type AvailabilityTransition = "hidden" | "restored";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getAvailabilityTransition(state: MonitorAvailabilityState, now = new Date()): AvailabilityTransition | null {
  if (state.publicationStatus !== "published" || state.moderationStatus !== "active" || !state.lastCheckedAt) return null;

  const cadenceMinutes = state.availabilityHiddenAt
    ? LOW_PRIORITY_MONITOR_CADENCE_MINUTES
    : PUBLIC_MONITOR_CADENCE_MINUTES;
  const isFresh = now.getTime() - state.lastCheckedAt.getTime() <= cadenceMinutes * 2 * 60_000;
  if (!isFresh) return null;

  if (state.availabilityHiddenAt && state.healthStatus === "online") return "restored";
  if (!state.availabilityHiddenAt && state.healthStatus === "offline") {
    const cutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
    const availabilityStart = state.lastOnlineAt ?? state.createdAt;
    if (availabilityStart <= cutoff) return "hidden";
  }

  return null;
}
