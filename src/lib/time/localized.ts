export type RelativeTimeUnit = "second" | "minute" | "hour" | "day";
export type LocalizedTimestampMode = "relative" | "datetime" | "time";

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60_000;

export function formatRelativeTime(value: number, unit: RelativeTimeUnit, locale: string) {
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(value, unit);
}

export function relativeTimeParts(date: Date, now = new Date()) {
  const deltaSeconds = (date.getTime() - now.getTime()) / 1000;
  const absolute = Math.abs(deltaSeconds);
  if (absolute < 60) return { value: Math.round(deltaSeconds), unit: "second" as const };
  const minutes = deltaSeconds / 60;
  if (Math.abs(minutes) < 60) return { value: Math.round(minutes), unit: "minute" as const };
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) return { value: Math.round(hours), unit: "hour" as const };
  return { value: Math.round(hours / 24), unit: "day" as const };
}

export function formatLocalizedDate(value: string, locale: string, mode: LocalizedTimestampMode, now: Date, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no válida";
  if (mode === "relative" && Math.abs(date.getTime() - now.getTime()) <= RECENT_WINDOW_MS) {
    const relative = relativeTimeParts(date, now);
    return formatRelativeTime(relative.value, relative.unit, locale);
  }
  if (mode === "time") {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
