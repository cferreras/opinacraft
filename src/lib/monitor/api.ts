import { timingSafeEqual } from "node:crypto";
import type { PgBoss } from "pg-boss";

import { buildMonitorHistory, historyPeriods, type HistoryPeriod } from "./history";
import { sendMonitorCheck, type MonitorScheduleTarget } from "./queue";
import { assertUtcTimestamp } from "./contracts";
import {
  ackMonitorEvent,
  claimMonitorEvents,
  deleteMonitorTarget,
  failMonitorEvent,
  getPendingMonitorEvents,
  getMonitorHistoryRows,
  getMonitorStatuses,
  listMonitorTargetIds,
  queryMonitorCatalog,
  serializeMonitorStatus,
  upsertMonitorTarget,
  type MonitorTarget,
} from "./repository";
import { markMonitorScheduleScheduled } from "./repository";

type MonitorApiLogger = Pick<Console, "info" | "error">;

function constantTimeEqual(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function authorized(request: Request, secret: string | undefined) {
  const header = request.headers.get("authorization");
  return Boolean(secret && header?.startsWith("Bearer ") && constantTimeEqual(header.slice(7), secret));
}

function pathParts(request: Request) {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

async function jsonBody(request: Request) {
  const body = await request.json();
  if (!body || typeof body !== "object") throw new Error("Invalid JSON body.");
  return body as Record<string, unknown>;
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function targetBody(body: Record<string, unknown>, serverId: string): MonitorTarget {
  const endpoints = Array.isArray(body.endpoints) ? body.endpoints : [];
  const mappedEndpoints: MonitorTarget["endpoints"] = endpoints.map((raw): MonitorTarget["endpoints"][number] => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid endpoint.");
    const endpoint = raw as Record<string, unknown>;
    const edition = endpoint.edition === "bedrock" ? "bedrock" : endpoint.edition === "java" ? "java" : null;
    const verificationStatus = endpoint.verificationStatus === "verified" ? "verified" : endpoint.verificationStatus === "unverified" ? "unverified" : null;
    if (!edition || !verificationStatus) throw new Error("Invalid endpoint edition or verification status.");
    const port = Number(endpoint.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid endpoint port.");
    return {
      edition,
      historySourceId: stringValue(endpoint.historySourceId, "historySourceId"),
      host: stringValue(endpoint.host, "host"),
      port,
      verificationStatus,
    };
  });
  const cadence = Number(body.cadenceMinutes);
  if (cadence !== 15 && cadence !== 60) throw new Error("cadenceMinutes must be 15 or 60.");
  const availabilityHiddenAt = body.availabilityHiddenAt === null || body.availabilityHiddenAt === undefined
    ? null
    : new Date(assertUtcTimestamp(stringValue(body.availabilityHiddenAt, "availabilityHiddenAt")));
  return {
    serverId,
    sourceVersion: stringValue(body.sourceVersion, "sourceVersion"),
    publicationStatus: body.publicationStatus === "published" ? "published" : body.publicationStatus === "hidden" ? "hidden" : "draft",
    moderationStatus: body.moderationStatus === "blocked" ? "blocked" : "active",
    availabilityHiddenAt,
    networkHost: stringValue(body.networkHost, "networkHost"),
    cadenceMinutes: cadence,
    endpoints: mappedEndpoints,
  };
}

export function createMonitorApiHandler({
  expectedSecret,
  boss,
  logger = console,
}: {
  expectedSecret: string | undefined;
    boss?: Pick<PgBoss, "send">;
  logger?: MonitorApiLogger;
}) {
  return async function monitorApiHandler(request: Request) {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === "/healthz") return Response.json({ ok: true, service: "monitor-api" });
    if (!authorized(request, expectedSecret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

    try {
      const parts = pathParts(request);
      if (request.method === "PUT" && parts[0] === "v1" && parts[1] === "targets" && parts[2]) {
        const target = targetBody(await jsonBody(request), parts[2]);
        await upsertMonitorTarget(target);
        if (boss && target.endpoints.some((endpoint) => endpoint.verificationStatus === "verified")) {
          const scheduledAt = new Date();
          await sendMonitorCheck(boss, target as MonitorScheduleTarget, scheduledAt);
          await markMonitorScheduleScheduled(target.serverId, scheduledAt, scheduledAt);
        }
        logger.info("[monitor-api] target upserted", { serverId: target.serverId });
        return Response.json({ ok: true, serverId: target.serverId }, { status: 202 });
      }
      if (request.method === "DELETE" && parts[0] === "v1" && parts[1] === "targets" && parts[2]) {
        await deleteMonitorTarget(parts[2]);
        return Response.json({ ok: true, serverId: parts[2] });
      }
      if (request.method === "GET" && pathname === "/v1/targets") {
        return Response.json({ serverIds: await listMonitorTargetIds() });
      }
      if (request.method === "POST" && pathname === "/v1/status/batch") {
        const body = await jsonBody(request);
        const serverIds = Array.isArray(body.serverIds) ? body.serverIds.filter((id): id is string => typeof id === "string") : [];
        if (serverIds.length > 1_000) return Response.json({ error: "Too many server IDs." }, { status: 413 });
        const states = await getMonitorStatuses(serverIds);
        return Response.json({ states: states.map(serializeMonitorStatus) });
      }
      if (request.method === "POST" && pathname === "/v1/catalog/query") {
        const body = await jsonBody(request);
        const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds.filter((id): id is string => typeof id === "string") : [];
        const sort = body.sort === "catalog" || body.sort === "availability" || body.sort === "checkedAt" || body.sort === "latency" || body.sort === "version" || body.sort === "players" ? body.sort : "catalog";
        const direction = body.direction === "asc" ? "asc" : "desc";
        const page = Number.isInteger(body.page) && Number(body.page) > 0 ? Number(body.page) : 1;
        const pageSize = Number.isInteger(body.pageSize) && Number(body.pageSize) > 0 && Number(body.pageSize) <= 100 ? Number(body.pageSize) : 24;
        const status = body.status === "online" || body.status === "offline" || body.status === "unknown" ? body.status : undefined;
        const result = await queryMonitorCatalog(candidateIds, { status, sort, direction, page, pageSize });
        return Response.json({ ...result, states: result.states.map(serializeMonitorStatus) });
      }
      if (request.method === "POST" && pathname === "/v1/business-events/claim") {
        const body = await jsonBody(request);
        const workerId = stringValue(body.workerId, "workerId");
        const limit = Number.isInteger(body.limit) && Number(body.limit) > 0 ? Math.min(Number(body.limit), 500) : 100;
        return Response.json({ events: await claimMonitorEvents(workerId, limit) });
      }
      if (request.method === "GET" && pathname === "/v1/business-events/pending") {
        const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
        return Response.json({ events: await getPendingMonitorEvents(Number.isFinite(limit) ? limit : 100) });
      }
      if (request.method === "POST" && parts[0] === "v1" && parts[1] === "business-events" && parts[2] && parts[3] === "ack") {
        const body = await jsonBody(request);
        await ackMonitorEvent(parts[2], stringValue(body.workerId, "workerId"));
        return Response.json({ ok: true });
      }
      if (request.method === "POST" && parts[0] === "v1" && parts[1] === "business-events" && parts[2] && parts[3] === "fail") {
        const body = await jsonBody(request);
        await failMonitorEvent(parts[2], stringValue(body.workerId, "workerId"), body.error ?? "Monitor event failed.");
        return Response.json({ ok: true });
      }
      if (request.method === "GET" && parts[0] === "v1" && parts[1] === "servers" && parts[2] && parts[3] === "history") {
        const query = new URL(request.url).searchParams;
        const period = historyPeriods.includes(query.get("period") as HistoryPeriod) ? query.get("period") as HistoryPeriod : "24h";
        const end = new Date();
        const durationMs = period === "7d" ? 7 * 24 * 60 * 60_000 : period === "30d" ? 30 * 24 * 60 * 60_000 : period === "90d" ? 90 * 24 * 60 * 60_000 : 24 * 60 * 60_000;
        const [state] = await getMonitorStatuses([parts[2]], end);
        const raw = period === "24h" && (state?.cadenceMinutes ?? 15) === 15;
        const rows = await getMonitorHistoryRows(parts[2], new Date(end.getTime() - durationMs), end, raw);
        return Response.json(buildMonitorHistory({
          period,
          now: end,
          cadenceMinutes: state?.cadenceMinutes ?? null,
          lastUpdatedAt: state?.lastCheckedAt ? new Date(state.lastCheckedAt) : null,
          freshness: state?.freshness,
          probeEdition: state?.probeEdition ?? null,
          rows,
        }));
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      logger.error("[monitor-api] request failed", { error: error instanceof Error ? error.name : "unknown" });
      return Response.json({ error: error instanceof Error ? error.message : "Internal monitor API error" }, { status: 400 });
    }
  };
}
