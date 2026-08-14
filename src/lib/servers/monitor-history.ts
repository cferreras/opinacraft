export type LegacyHistorySnapshot = {
  serverId: string;
  edition: "java" | "bedrock";
  sampledAt: Date;
  status: "unknown" | "online" | "offline";
  playersCurrent: number | null;
  playersMax: number | null;
};

export type CanonicalHistorySnapshot = Omit<LegacyHistorySnapshot, "edition">;

export function mergeLegacySnapshotsBySlot(rows: readonly LegacyHistorySnapshot[]): CanonicalHistorySnapshot[] {
  const grouped = new Map<string, LegacyHistorySnapshot[]>();
  for (const row of rows) {
    const key = `${row.serverId}:${row.sampledAt.toISOString()}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return [...grouped.values()]
    .map((slotRows) => {
      const online = slotRows.filter((row) => row.status === "online");
      const sourceRows = online.length ? online : slotRows;
      const currentValues = sourceRows.flatMap((row) => row.playersCurrent === null ? [] : [row.playersCurrent]);
      const maxValues = sourceRows.flatMap((row) => row.playersMax === null ? [] : [row.playersMax]);
      const first = slotRows[0]!;
      return {
        serverId: first.serverId,
        sampledAt: first.sampledAt,
        status: online.length ? "online" as const : sourceRows.every((row) => row.status === "offline") ? "offline" as const : "unknown" as const,
        playersCurrent: currentValues.length ? Math.max(...currentValues) : null,
        playersMax: maxValues.length ? Math.max(...maxValues) : null,
      };
    })
    .sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());
}
