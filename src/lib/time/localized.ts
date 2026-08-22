export type RelativeTimeUnit = "second" | "minute" | "hour" | "day";

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
