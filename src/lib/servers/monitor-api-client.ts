import type { MonitorStatusView, MonitorTarget } from "@/lib/monitor/repository";
import type { PendingMonitorEvent } from "@/lib/monitor/events";
import type { HistoryPeriod, PlayerHistoryResponse } from "@/lib/monitor/history";

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
    cache: init.cache ?? "no-store",
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

export async function fetchMonitorHistory(serverId: string, period: HistoryPeriod, options: Pick<RequestInit, "cache"> = {}) {
  const result = await monitorFetch<PlayerHistoryResponse>(`/v1/servers/${serverId}/history?period=${encodeURIComponent(period)}`, options);
  return result ?? null;
}


export async function syncMonitorTarget(target: MonitorTarget) {
  return monitorFetch<{ ok: true }>(`/v1/targets/${target.serverId}`, {
    method: "PUT",
    body: JSON.stringify({
      ...target,
      availabilityHiddenAt: target.availabilityHiddenAt?.toISOString() ?? null,
    }),
  });
}

export async function removeMonitorTarget(serverId: string) {
  return monitorFetch<{ ok: true }>(`/v1/targets/${serverId}`, { method: "DELETE" });
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
  return monitorFetch<{ ok: true }>(`/v1/business-events/${eventId}/ack`, {
    method: "POST",
    body: JSON.stringify({ workerId }),
  });
}

export async function failMonitorBusinessEvent(eventId: string, workerId: string, error: unknown) {
  return monitorFetch<{ ok: true }>(`/v1/business-events/${eventId}/fail`, {
    method: "POST",
    body: JSON.stringify({ workerId, error: error instanceof Error ? error.message : String(error) }),
  });
}
