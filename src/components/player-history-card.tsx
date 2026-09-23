"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Info, RefreshCcw } from "lucide-react";

import { getAvailabilityLegend, mergeHistoryChartData } from "@/lib/servers/player-history-chart";
import type { HistoryPointStatus, PlayerHistoryResponse } from "@/lib/servers/player-history";
import { useBrowserDateFormatter } from "@/components/localized-timestamp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { serverId: string; initialData: PlayerHistoryResponse; mode?: "public" | "managed"; loadOnMount?: boolean };
const periodLabels = { "24h": "24 h", "7d": "7 días", "30d": "30 días", "90d": "90 días" } as const;
const periodShortLabels = { "24h": "24 h", "7d": "7 d", "30d": "30 d", "90d": "90 d" } as const;
const periods = Object.keys(periodLabels) as Array<keyof typeof periodLabels>;
const availabilityLegend = getAvailabilityLegend();
const PlayerHistoryChart = dynamic(
  () => import("./player-history-chart").then((module) => module.PlayerHistoryChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[233px] w-full" />,
  },
);

function statusLabel(status: HistoryPointStatus) {
  return availabilityLegend.find((entry) => entry.status === status)?.label ?? "Sin histórico";
}

function statusClass(status: HistoryPointStatus) {
  return status === "online" ? "bg-success" : status === "offline" ? "bg-destructive" : status === "unknown" ? "bg-warning" : "bg-muted-foreground/30";
}

// A null cadence is not "no target", it is a server the worker is not probing
// at all: the schedule disappears while no endpoint is verified.
function cadenceLabel(minutes: number | null) {
  if (!minutes) return "monitorización en pausa";
  return minutes < 60 ? `objetivo cada ${minutes} min` : `objetivo cada ${Math.round(minutes / 60)} h`;
}

function AvailabilityRail({ data, formatDate, footnote }: { data: PlayerHistoryResponse; formatDate: (value: string | null) => string; footnote: string }) {
  const points = data.series.flatMap((series) => series.points);
  if (!points.length) return null;
  // Discrete blocks read as "intervals" while there are few of them; past that the gaps would eat the bar.
  const blocky = points.length <= 120;
  return (
    <div className="grid gap-2 sm:border-t sm:pt-5.25">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground max-sm:hidden">
        <span className="font-bold text-foreground">Disponibilidad</span>
        <span>bloques de {data.resolutionMinutes} min</span>
      </div>
      <div
        aria-label="Disponibilidad por intervalo"
        className={blocky ? "grid h-3.25 gap-px sm:h-5.25 sm:gap-0.5" : "grid h-3.25 overflow-hidden rounded-[0.1875rem] sm:h-5.25"}
        style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
      >
        {points.map((point, index) => <span key={`${point.at}-${index}`} className={`${statusClass(point.status)} ${blocky ? "rounded-[0.125rem]" : ""}`} title={`${formatDate(point.at)} · ${statusLabel(point.status)}`} />)}
      </div>
      <div className="flex flex-wrap items-center gap-x-5.25 gap-y-1 text-xs text-muted-foreground">
        {availabilityLegend.map((entry) => <span key={entry.status} className="inline-flex items-center gap-1.5 max-sm:hidden"><span className={`size-2 rounded-[0.125rem] ${statusClass(entry.status)}`} />{entry.label}</span>)}
        <span className="sm:ml-auto">{footnote}</span>
      </div>
    </div>
  );
}

function formatCount(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("es-ES");
}

function HeadlineFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="text-[1.3125rem] font-extrabold sm:text-[1.625rem] leading-tight tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  );
}

export function PlayerHistoryCard({ serverId, initialData, mode = "public", loadOnMount = false }: Props) {
  const dateFormatter = useBrowserDateFormatter();
  const shouldLoadOnMount = mode === "public" || loadOnMount;
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState(initialData.period);
  const [requestKey, setRequestKey] = useState(shouldLoadOnMount ? 1 : 0);
  const [loading, setLoading] = useState(shouldLoadOnMount);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestKey === 0) return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/servers/${serverId}/player-history?period=${period}&edition=all`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => { if (!response.ok) throw new Error("No se pudo cargar el histórico."); return response.json() as Promise<PlayerHistoryResponse>; })
      .then((nextData) => { if (active) setData(nextData); })
      .catch((reason: unknown) => { if (!active || (reason instanceof Error && reason.name === "AbortError")) return; setError("No se pudo cargar el histórico ahora."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [period, requestKey, serverId]);

  const chartData = useMemo(() => mergeHistoryChartData(data.series), [data.series]);
  const hasData = data.series.some((series) => series.summary.sampleCount > 0);
  const hasSourceChange = data.series.some((series) => series.points.some((point) => point.sourceChanged));
  const lastSample = data.lastUpdatedAt ?? data.series.map((series) => series.summary.lastSampleAt).filter(Boolean).sort().at(-1) ?? null;
  const reload = (nextPeriod = period) => { setLoading(true); setError(null); setPeriod(nextPeriod); setRequestKey((current) => current + 1); };
  const headingId = mode + "-history-heading";

  const sampled = data.series.filter((series) => series.summary.sampleCount > 0);
  const peak = sampled.reduce<number | null>((best, series) => (series.summary.peakPlayers === null ? best : Math.max(best ?? 0, series.summary.peakPlayers)), null);
  const average = sampled[0]?.summary.averagePlayers ?? null;
  const responseRate = sampled[0]?.summary.responseRatePct ?? null;
  const footnote = data.freshness === "stale"
    ? `Comprobado ${dateFormatter.format(lastSample)} · con retraso`
    : `Comprobado ${dateFormatter.format(lastSample)}${data.cadenceMinutes ? "" : ` · ${cadenceLabel(data.cadenceMinutes)}`}`;

  return (
    <Card aria-labelledby={headingId} className="gap-5.25 py-5.25 [--card-spacing:--spacing(5.25)] sm:gap-8.5 sm:py-8.5 sm:[--card-spacing:--spacing(8.5)]">
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-5.25 gap-y-3.25">
        <div className="min-w-0 flex-1 basis-64">
          <CardTitle as="h2" id={headingId} className="text-lg font-extrabold tracking-tight sm:text-xl">Jugadores conectados</CardTitle>
          <p className="mt-1.25 text-sm leading-6 text-muted-foreground">Máximo observado por intervalo. Java y Bedrock suman en la misma cifra.</p>
        </div>
        <div role="group" aria-label="Periodo del histórico" className="grid w-full shrink-0 grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.75 sm:flex sm:w-auto">
          {periods.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              aria-label={periodLabels[option]}
              onClick={() => { if (option !== period) reload(option); }}
              className="h-8.5 rounded-md px-3.25 text-[0.8125rem] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-pressed:bg-card aria-pressed:font-bold aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              {periodShortLabels[option]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5.25">
        {error ? (
          <Alert variant="destructive">
            <RefreshCcw className="size-4" />
            <AlertTitle>Error al cargar el histórico</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">{error}<Button type="button" variant="outline" size="sm" onClick={() => reload()}><RefreshCcw className="size-3.5" /> Reintentar</Button></AlertDescription>
          </Alert>
        ) : null}
        {!error && !loading && !hasData ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-5.25">
            <Info className="mt-0.5 size-5 text-muted-foreground" />
            <div><strong className="text-sm">Aún no hay histórico suficiente</strong><p className="mt-1 text-sm text-muted-foreground">El worker todavía no ha registrado una respuesta para este servidor.</p></div>
          </div>
        ) : null}
        {loading ? <Skeleton className="h-72 w-full" /> : null}
        {hasData && !loading ? (
          <>
            <dl className="flex flex-wrap gap-x-5.25 gap-y-3.25 sm:gap-x-8.5">
              <HeadlineFigure label="Pico" value={formatCount(peak)} />
              <HeadlineFigure label="Media" value={formatCount(average)} />
              <HeadlineFigure label="Disponibilidad" value={responseRate === null ? "—" : `${responseRate.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`} />
            </dl>
            <PlayerHistoryChart data={chartData} period={data.period} />
            <AvailabilityRail data={data} formatDate={(value) => dateFormatter.format(value)} footnote={footnote} />
            {hasSourceChange ? <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-3.5" />Se detectó un cambio de dirección; el histórico anterior se conserva.</p> : null}
          </>
        ) : null}
        {loading ? <p className="text-xs text-muted-foreground">Actualizando…</p> : null}
      </CardContent>
    </Card>
  );
}
