"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Info, RefreshCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { aggregateHistorySeries } from "@/lib/servers/player-history-aggregate";
import type { HistoryEditionFilter, HistoryPoint, HistoryPointStatus, HistorySeries, PlayerHistoryResponse } from "@/lib/servers/player-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { serverId: string; initialData: PlayerHistoryResponse; mode?: "public" | "managed" };
const periodLabels = { "24h": "24 h", "7d": "7 días", "30d": "30 días", "90d": "90 días" } as const;
const editionLabels = { all: "Servidor", java: "Java", bedrock: "Bedrock" } as const;
const chartConfig = {
  serverAverage: { label: "Servidor", color: "var(--history-java)" },
  javaAverage: { label: "Java", color: "var(--history-java)" },
  bedrockAverage: { label: "Bedrock", color: "var(--history-bedrock)" },
} satisfies ChartConfig;

type ChartPoint = HistoryPoint & { serverAverage?: number | null; javaAverage?: number | null; bedrockAverage?: number | null };

function formatDate(value: string | null, withYear = false) {
  if (!value) return "Sin datos";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: HistoryPointStatus) {
  return status === "online" ? "En línea" : status === "offline" ? "Sin respuesta" : status === "unknown" ? "Sin comprobar" : "Sin datos";
}

function statusClass(status: HistoryPointStatus) {
  return status === "online" ? "bg-success" : status === "offline" ? "bg-destructive" : status === "unknown" ? "bg-warning" : "bg-muted-foreground/30";
}

function seriesLabel(edition: HistorySeries["edition"] | HistoryEditionFilter) {
  return edition === "server" || edition === "all" ? "Servidor" : edition === "java" ? "Java" : "Bedrock";
}

function mergeChartData(seriesList: HistorySeries[]): ChartPoint[] {
  const byAt = new Map<string, ChartPoint>();
  for (const series of seriesList) {
    for (const point of series.points) {
      const existing = byAt.get(point.at) ?? { ...point };
      if (series.edition === "server") existing.serverAverage = point.averagePlayers;
      else if (series.edition === "java") existing.javaAverage = point.averagePlayers;
      else existing.bedrockAverage = point.averagePlayers;
      existing.status = existing.status === "online" || point.status === "online" ? "online" : existing.status === "offline" || point.status === "offline" ? "offline" : point.status;
      existing.sampleCount = Math.max(existing.sampleCount ?? 0, point.sampleCount);
      existing.sourceChanged = existing.sourceChanged || point.sourceChanged;
      byAt.set(point.at, existing);
    }
  }
  return [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function AvailabilityRail({ data }: { data: PlayerHistoryResponse }) {
  const points = data.series.flatMap((series) => series.points.map((point) => ({ ...point, edition: series.edition }))).sort((a, b) => a.at.localeCompare(b.at));
  if (!points.length) return null;
  return (
    <div className="grid gap-2" aria-label="Disponibilidad por intervalo">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">Disponibilidad</span>
        <span>{data.resolutionMinutes < 60 ? "cada " + data.resolutionMinutes + " min" : "cada " + Math.round(data.resolutionMinutes / 60) + " h"}</span>
      </div>
      <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted" style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.max(points.length, 1) + ", minmax(2px, 1fr))" }}>
        {points.map((point, index) => <span key={point.edition + "-" + point.at + "-" + index} className={statusClass(point.status)} title={formatDate(point.at) + " · " + seriesLabel(point.edition) + " · " + statusLabel(point.status)} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />En línea</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />Sin respuesta</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />Sin comprobar</span>
      </div>
    </div>
  );
}

export function PlayerHistoryCard({ serverId, initialData, mode = "public" }: Props) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState(initialData.period);
  const [edition, setEdition] = useState<HistoryEditionFilter>(initialData.edition);
  const [requestKey, setRequestKey] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestKey === 0) return;
    const controller = new AbortController();
    let active = true;
    fetch("/api/servers/" + serverId + "/player-history?period=" + period + "&edition=" + edition, { signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el histórico.");
        return response.json() as Promise<PlayerHistoryResponse>;
      })
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((reason: unknown) => {
        if (!active || (reason instanceof Error && reason.name === "AbortError")) return;
        setError("No se pudo cargar el histórico ahora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [edition, period, requestKey, serverId]);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const displaySeries = useMemo(() => {
    if (data.edition !== "all") return data.series;
    const aggregate = aggregateHistorySeries(data.series);
    return aggregate ? [aggregate] : [];
  }, [data]);
  const displayData = useMemo(() => ({ ...data, series: displaySeries }), [data, displaySeries]);
  const chartData = useMemo(() => mergeChartData(displaySeries), [displaySeries]);
  const isServerView = data.edition === "all";
  const hasData = displaySeries.some((series) => series.summary.sampleCount > 0);
  const hasSourceChange = displaySeries.some((series) => series.points.some((point) => point.sourceChanged));
  const lastSample = displaySeries.map((series) => series.summary.lastSampleAt).filter(Boolean).sort().at(-1) ?? null;
  const stale = nowMs > 0 && lastSample ? nowMs - new Date(lastSample).getTime() > 45 * 60 * 1000 : false;
  const reload = (nextPeriod = period, nextEdition = edition) => {
    setLoading(true);
    setError(null);
    setPeriod(nextPeriod);
    setEdition(nextEdition);
    setRequestKey((current) => current + 1);
  };
  const headingId = mode + "-history-heading";

  return (
    <Card aria-labelledby={headingId} className="overflow-hidden">
      <CardHeader className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/10">
        <div className="min-w-0">
          <CardTitle id={headingId} className="flex items-center gap-2 text-base sm:text-lg">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            Jugadores conectados
          </CardTitle>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {isServerView ? "Actividad observada del servidor. No se suman endpoints que podrían compartir jugadores." : "Promedio de jugadores por intervalo en " + seriesLabel(data.edition) + "."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2" aria-label="Filtros de histórico">
          <NativeSelect value={period} onChange={(event) => reload(event.target.value as typeof period, edition)}>
            <option value="24h">{periodLabels["24h"]}</option>
            <option value="7d">{periodLabels["7d"]}</option>
            <option value="30d">{periodLabels["30d"]}</option>
            <option value="90d">{periodLabels["90d"]}</option>
          </NativeSelect>
          <NativeSelect value={edition} onChange={(event) => reload(period, event.target.value as HistoryEditionFilter)}>
            <option value="all">{editionLabels.all}</option>
            <option value="java">{editionLabels.java}</option>
            <option value="bedrock">{editionLabels.bedrock}</option>
          </NativeSelect>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        {error ? <Alert variant="destructive"><RefreshCcw className="size-4" /><AlertTitle>Error al cargar el histórico</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-2">{error}<Button type="button" variant="outline" size="sm" onClick={() => reload()}><RefreshCcw className="size-3.5" /> Reintentar</Button></AlertDescription></Alert> : null}
        {!error && !loading && !hasData ? <div className="flex items-start gap-3 rounded-lg border border-dashed p-6"><Info className="mt-0.5 size-5 text-muted-foreground" /><div><strong className="text-sm">Aún no hay histórico suficiente</strong><p className="mt-1 text-sm text-muted-foreground">Las muestras se recopilan cada 15 minutos. Vuelve cuando el monitor haya registrado actividad.</p></div></div> : null}
        {loading ? <Skeleton className="h-72 w-full" /> : null}
        {hasData && !loading ? (
          <div className="grid gap-5">
            <ChartContainer
              config={chartConfig}
              className="h-[276px] w-full aspect-auto"
            >
              <LineChart data={chartData} margin={{ top: 10, right: 12, left: 2, bottom: 0 }} accessibilityLayer desc={"Histórico de jugadores conectados: " + seriesLabel(data.edition)}>
                <CartesianGrid stroke="var(--history-grid)" vertical={false} />
                <XAxis dataKey="at" tickFormatter={(value) => formatDate(value)} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={8} width={42} />
                <Tooltip cursor={{ stroke: "var(--history-grid)", strokeDasharray: "4 4" }} content={<ChartTooltipContent labelFormatter={(value) => formatDate(String(value), true)} />} />
                {isServerView ? <Line type="monotone" dataKey="serverAverage" name="Servidor" connectNulls={false} stroke="var(--color-serverAverage)" strokeWidth={2.75} strokeLinecap="round" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={false} /> : displaySeries.map((series) => <Line key={series.edition} type="monotone" dataKey={series.edition + "Average"} name={seriesLabel(series.edition)} connectNulls={false} stroke={series.edition === "bedrock" ? "var(--color-bedrockAverage)" : "var(--color-javaAverage)"} strokeWidth={2.5} strokeDasharray={series.edition === "bedrock" ? "5 4" : undefined} strokeLinecap="round" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={false} />)}
              </LineChart>
            </ChartContainer>
            <AvailabilityRail data={displayData} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className={stale ? "size-3.5 text-warning" : "size-3.5 text-success"} />Última muestra: {formatDate(lastSample)}.{stale ? " El monitor puede estar retrasado." : ""}</span>
              {hasSourceChange ? <span className="inline-flex items-center gap-2"><Info className="size-3.5" />Se detectó un cambio de dirección; el histórico anterior se conserva separado.</span> : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
          <Badge variant="outline">{isServerView ? "Servidor" : seriesLabel(data.edition)}</Badge>
          <span>{loading ? "Actualizando…" : periodLabels[data.period] + " · " + data.resolutionMinutes + " min por punto"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
