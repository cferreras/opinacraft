import type { PendingMonitorEvent } from "./events";
import { processPendingMonitorEvents } from "./events";

export type MonitorBusinessEventBatchResult = {
  available: boolean;
  claimed: number;
  processed: number;
  failed: number;
};

export type MonitorBusinessEventBatchDependencies = {
  workerId: string;
  limit?: number;
  claim: (workerId: string, limit: number) => Promise<readonly PendingMonitorEvent[] | null>;
  processInNeon: (events: readonly PendingMonitorEvent[]) => Promise<void>;
  ack: (eventId: string, workerId: string) => Promise<void>;
  fail: (eventId: string, workerId: string, error: unknown) => Promise<void>;
};

export async function runMonitorBusinessEventsBatch({
  workerId,
  limit = 100,
  claim,
  processInNeon,
  ack,
  fail,
}: MonitorBusinessEventBatchDependencies): Promise<MonitorBusinessEventBatchResult> {
  const events = await claim(workerId, limit);
  if (events === null) {
    return { available: false, claimed: 0, processed: 0, failed: 0 };
  }

  const result = await processPendingMonitorEvents({
    claim: async () => events,
    processInNeon,
    ack: (eventId) => ack(eventId, workerId),
    fail: (eventId, error) => fail(eventId, workerId, error),
  });

  return { available: true, ...result };
}
