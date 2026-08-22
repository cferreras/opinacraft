"use client";

import { useEffect, useMemo, useState } from "react";

import { formatRelativeTime, relativeTimeParts } from "@/lib/time/localized";

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type LocalizedTimestampMode = "relative" | "datetime";

function formatBrowserDate(value: string, locale: string, mode: LocalizedTimestampMode, now: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no válida";
  if (mode === "relative" && Math.abs(date.getTime() - now.getTime()) <= RECENT_WINDOW_MS) {
    const relative = relativeTimeParts(date, now);
    return formatRelativeTime(relative.value, relative.unit, locale);
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function useBrowserDateFormatter() {
  const [locale, setLocale] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const localeTimer = window.setTimeout(() => setLocale(navigator.language || "es-ES"), 0);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearTimeout(localeTimer);
      window.clearInterval(timer);
    };
  }, []);

  return useMemo(() => ({
    locale,
    format(value: string | null, mode: LocalizedTimestampMode = "relative") {
      if (!value) return "Sin datos";
      if (!locale) return "…";
      return formatBrowserDate(value, locale, mode, now);
    },
  }), [locale, now]);
}

export function LocalizedTimestamp({
  value,
  mode = "relative",
  fallback = "Aún no comprobado",
  className,
}: {
  value: string | Date | null | undefined;
  mode?: LocalizedTimestampMode;
  fallback?: string;
  className?: string;
}) {
  const formatter = useBrowserDateFormatter();
  const utcValue = value instanceof Date ? value.toISOString() : value ?? null;
  const label = utcValue ? formatter.format(utcValue, mode) : fallback;
  return <time dateTime={utcValue ?? undefined} className={className}>{label}</time>;
}
