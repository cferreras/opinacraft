import { enqueueDueMonitorJobs } from "./monitor-queue";
import type { MonitorDispatcher, MonitorRunResult } from "./monitor-route";

/**
 * Compatibility result for callers that still use the former monitor entry point.
 * Network probing now belongs exclusively to the persistent worker.
 */
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
