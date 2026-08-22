"use client";

import { useEffect, useMemo, useState } from "react";

import { formatLocalizedDate, type LocalizedTimestampMode } from "@/lib/time/localized";

export type { LocalizedTimestampMode } from "@/lib/time/localized";

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
      return formatLocalizedDate(value, locale, mode, now);
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
