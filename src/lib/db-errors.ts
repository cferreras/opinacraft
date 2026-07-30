export function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.cause?.code === "string"
      ? candidate.cause.code
      : undefined;
}

export function databaseConstraint(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    constraint?: unknown;
    cause?: { constraint?: unknown };
  };
  return typeof candidate.constraint === "string"
    ? candidate.constraint
    : typeof candidate.cause?.constraint === "string"
      ? candidate.cause.constraint
      : undefined;
}
