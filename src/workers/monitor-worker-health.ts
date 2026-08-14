export type MonitorHealthSnapshot = {
  workerId: string;
  healthy: boolean;
  queueAgeSeconds: number | null;
};

export function createMonitorHealthHandler(getSnapshot: () => MonitorHealthSnapshot) {
  return async function monitorHealthHandler(request: Request) {
    void request;
    const snapshot = getSnapshot();
    return Response.json({
      status: snapshot.healthy ? "ok" : "unhealthy",
      workerId: snapshot.workerId,
      queueAgeSeconds: snapshot.queueAgeSeconds,
    }, { status: snapshot.healthy ? 200 : 503 });
  };
}
