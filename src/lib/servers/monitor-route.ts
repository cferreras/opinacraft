import { timingSafeEqual } from "node:crypto";

type MonitorLogger = Pick<Console, "info" | "error">;

export type MonitorRunResult = {
  processed: number;
  online: number;
  offline: number;
  unknown: number;
  persistenceFailures: number;
};

export type MonitorRunner = () => Promise<MonitorRunResult | null>;
export type MonitorDispatchResult = {
  enqueued: number;
  due: number;
  oldestDueAt: string | null;
};
export type MonitorDispatcher = () => Promise<MonitorDispatchResult>;

function constantTimeEqual(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

export function isValidMonitorAuthorization(authorization: string | null, expectedSecret: string | undefined) {
  if (!authorization || !expectedSecret || !authorization.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice("Bearer ".length), expectedSecret);
}

export function createMonitorPostHandler({
  expectedSecret,
  runMonitor,
  enqueueMonitor,
  logger = console,
}: {
  expectedSecret: string | undefined;
  runMonitor?: MonitorRunner;
  enqueueMonitor?: MonitorDispatcher;
  logger?: MonitorLogger;
}) {
  return async function monitorPostHandler(request: Request) {
    const startedAt = Date.now();
    if (!isValidMonitorAuthorization(request.headers.get("authorization"), expectedSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      if (enqueueMonitor) {
        const result = await enqueueMonitor();
        logger.info("[monitor] reconciliation enqueued", {
          result: "success",
          enqueued: result.enqueued,
          due: result.due,
        });
        return Response.json({ ok: true, ...result }, { status: 202 });
      }
      if (!runMonitor) {
        return Response.json({ error: "Monitor is not configured." }, { status: 503 });
      }
      const result = await runMonitor();
      const durationMs = Date.now() - startedAt;

      if (!result) {
        logger.info("[monitor] skipped", {
          durationMs,
          result: "already_running_or_completed",
          serversProcessed: 0,
        });
        return Response.json(
          { ok: true, skipped: true, reason: "already_running_or_completed", durationMs },
          { status: 200 },
        );
      }

      if (result.persistenceFailures > 0) {
        logger.error("[monitor] completed with persistence errors", {
          durationMs,
          result: "partial",
          serversProcessed: result.processed,
        });
        return Response.json(
          {
            error: "Monitor completed with internal persistence errors.",
            processed: result.processed,
            persistenceFailures: result.persistenceFailures,
            durationMs,
          },
          { status: 500 },
        );
      }

      logger.info("[monitor] completed", {
        durationMs,
        result: "success",
        serversProcessed: result.processed,
      });
      return Response.json({ ok: true, ...result, durationMs }, { status: 200 });
    } catch (error) {
      logger.error("[monitor] failed", {
        durationMs: Date.now() - startedAt,
        result: "error",
        error: error instanceof Error ? error.name : "unknown",
      });
      return Response.json({ error: "Internal monitor error" }, { status: 500 });
    }
  };
}

export function methodNotAllowed() {
  return Response.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
