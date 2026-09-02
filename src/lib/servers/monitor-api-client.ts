import type { MonitorStatusView, MonitorTarget } from "@/lib/monitor/repository";
import type { PendingMonitorEvent } from "@/lib/monitor/events";
import { historyPeriods, type HistoryPeriod, type PlayerHistoryResponse } from "@/lib/monitor/history";

const SERVER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMonitorServerId(value: string) {
  return SERVER_ID_PATTERN.test(value);
}

/**
 * Monitor API requests carry the service bearer token, so an identifier that is
 * interpolated into their URL must never be able to introduce path or query
 * syntax and select a different privileged endpoint.
 */
function monitorServerIdSegment(serverId: string) {
  if (!isMonitorServerId(serverId)) throw new Error("Invalid monitor server ID.");
  return encodeURIComponent(serverId);
}

function monitorApiUrl() {
  return process.env.MONITOR_API_URL?.trim().replace(/\/$/, "") || null;
}

function monitorApiSecret() {
  return process.env.MONITOR_API_SECRET?.trim() || process.env.CRON_MONITOR_SECRET?.trim() || null;
}

async function monitorFetch<T>(path: string, init: RequestInit = {}) {
  const baseUrl = monitorApiUrl();
  const secret = monitorApiSecret();
  if (!baseUrl || !secret) return null;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${secret}`,
      ...init.headers,
    },
    // Cache Components owns the bounded cache lifetime. Never let this fetch
    // create a second, independently persistent Data Cache entry.
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Monitor API returned ${response.status}.`);
  return await response.json() as T;
}

export function isMonitorApiConfigured() {
  return Boolean(monitorApiUrl() && monitorApiSecret());
}

export async function fetchMonitorStatuses(serverIds: readonly string[], options: Pick<RequestInit, "cache"> = {}) {
  const result = await monitorFetch<{ states: MonitorStatusView[] }>("/v1/status/batch", {
    method: "POST",
    body: JSON.stringify({ serverIds }),
    ...options,
  });
  return result?.states ?? null;
}

export async function queryMonitorCatalog(body: {
  candidateIds: readonly string[];
  status?: "online" | "offline" | "unknown";
  sort: "catalog" | "players" | "availability" | "checkedAt" | "latency" | "version";
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}, options: Pick<RequestInit, "cache"> = {}) {
  return monitorFetch<{ ids: string[]; totalCount: number; states: MonitorStatusView[] }>("/v1/catalog/query", {
    method: "POST",
    body: JSON.stringify(body),
    ...options,
  });
}

function isPlayerHistoryResponse(value: unknown): value is PlayerHistoryResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlayerHistoryResponse>;
  return historyPeriods.includes(candidate.period as HistoryPeriod) && Array.isArray(candidate.series);
}

export async function fetchMonitorHistory(serverId: string, period: HistoryPeriod, options: Pick<RequestInit, "cache"> = {}) {
  const result = await monitorFetch<unknown>(`/v1/servers/${monitorServerIdSegment(serverId)}/history?period=${encodeURIComponent(period)}`, options);
  if (result === null || result === undefined) return null;
  if (!isPlayerHistoryResponse(result)) throw new Error("Monitor API returned an unexpected history payload.");
  return result;
}


export async function syncMonitorTarget(target: MonitorTarget) {
  return monitorFetch<{ ok: true }>(`/v1/targets/${monitorServerIdSegment(target.serverId)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...target,
      availabilityHiddenAt: target.availabilityHiddenAt?.toISOString() ?? null,
    }),
  });
}

export async function removeMonitorTarget(serverId: string) {
  return monitorFetch<{ ok: true }>(`/v1/targets/${monitorServerIdSegment(serverId)}`, { method: "DELETE" });
}

export async function fetchMonitorTargetIds() {
  const result = await monitorFetch<{ serverIds: string[] }>("/v1/targets");
  return result?.serverIds ?? null;
}

export async function claimMonitorBusinessEvents(workerId: string, limit = 100) {
  const result = await monitorFetch<{ events: PendingMonitorEvent[] }>("/v1/business-events/claim", {
    method: "POST",
    body: JSON.stringify({ workerId, limit }),
  });
  return result?.events ?? null;
}

export async function fetchPendingMonitorBusinessEvents(limit = 100) {
  const result = await monitorFetch<{ events: PendingMonitorEvent[] }>(`/v1/business-events/pending?limit=${encodeURIComponent(String(limit))}`);
  return result?.events ?? null;
}

export async function acknowledgeMonitorBusinessEvent(eventId: string, workerId: string) {
  return monitorFetch<{ ok: true }>(`/v1/business-events/${encodeURIComponent(eventId)}/ack`, {
    method: "POST",
    body: JSON.stringify({ workerId }),
  });
}

export async function failMonitorBusinessEvent(eventId: string, workerId: string, error: unknown) {
  return monitorFetch<{ ok: true }>(`/v1/business-events/${encodeURIComponent(eventId)}/fail`, {
    method: "POST",
    body: JSON.stringify({ workerId, error: error instanceof Error ? error.message : String(error) }),
  });
}
