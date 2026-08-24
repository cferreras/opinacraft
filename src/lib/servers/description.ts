export const SERVER_DESCRIPTION_MAX_LENGTH = 2_000;

export function normalizeServerDescription(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized || null;
}

export function descriptionHasOverflow(scrollHeight: number, clientHeight: number) {
  return scrollHeight > clientHeight;
}
