import { enqueueDueMonitorJobs, type MonitorDispatchResult } from "./monitor-queue";

/**
 * Compatibility result for callers that still use the former monitor entry point.
 * Network probing now belongs exclusively to the persistent worker.
 */
export type MonitorRunResult = {
  processed: number;
  online: number;
  offline: number;
  unknown: number;
  persistenceFailures: number;
};

type MonitorDispatcher = () => Promise<MonitorDispatchResult>;

export async function runEndpointMonitor(dispatch: MonitorDispatcher = enqueueDueMonitorJobs): Promise<MonitorRunResult> {
  const result = await dispatch();
  return {
    processed: result.enqueued,
    online: 0,
    offline: 0,
    unknown: 0,
    persistenceFailures: 0,
  };
}
