export type UtcTimestamp = string;

export function serializeUtcTimestamp(value: Date) {
  if (Number.isNaN(value.getTime())) throw new Error("Cannot serialize an invalid timestamp.");
  return value.toISOString();
}

export function assertUtcTimestamp(value: string): UtcTimestamp {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value || !value.endsWith("Z")) {
    throw new Error("Monitor timestamps must be canonical UTC ISO timestamps ending in Z.");
  }
  return value;
}

export function serializeOptionalUtcTimestamp(value: Date | null | undefined) {
  return value ? serializeUtcTimestamp(value) : null;
}
