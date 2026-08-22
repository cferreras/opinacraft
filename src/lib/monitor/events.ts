export type PendingMonitorEvent = {
  id: string;
  type: string;
  serverId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type MonitorEventProcessorDependencies = {
  claim: () => Promise<readonly PendingMonitorEvent[]>;
  processInNeon: (events: readonly PendingMonitorEvent[]) => Promise<void>;
  ack: (eventId: string) => Promise<void>;
  fail?: (eventId: string, error: unknown) => Promise<void>;
};

export async function processPendingMonitorEvents({
  claim,
  processInNeon,
  ack,
  fail,
}: MonitorEventProcessorDependencies) {
  const events = await claim();
  if (events.length === 0) return { claimed: 0, processed: 0, failed: 0 };

  try {
    await processInNeon(events);
  } catch (error) {
    if (fail) {
      await Promise.all(events.map((event) => fail(event.id, error)));
    }
    return { claimed: events.length, processed: 0, failed: events.length };
  }

  let processed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await ack(event.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      if (fail) await fail(event.id, error);
    }
  }
  return { claimed: events.length, processed, failed };
}
