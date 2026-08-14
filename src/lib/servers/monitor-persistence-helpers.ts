export function getMonitorSourceChangedValue(
  storedSourceChanged: number,
  storedEdition: "java" | "bedrock" | null,
  observedEdition: "java" | "bedrock",
) {
  if (storedSourceChanged === 1) return 1;
  if (storedEdition !== null && storedEdition !== observedEdition) return 1;
  return storedSourceChanged;
}

export function getMonitorNotificationDedupeKey(
  serverId: string,
  transition: "down" | "recovered",
  observedAt: Date,
) {
  return `server-monitor:${serverId}:${transition}:${observedAt.toISOString().slice(0, 10)}`;
}
