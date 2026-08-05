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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = { serverId: string; initialData: PlayerHistoryResponse; mode?: "public" | "managed" };
const periodLabels = { "24h": "24 h", "7d": "7 días", "30d": "30 días", "90d": "90 días" } as const;
const editionLabels = { all: "Servidor", java: "Java", bedrock: "Bedrock" } as const;
const chartConfig = { serverAverage: { label: "Servidor", color: "var(--history-java)" }, javaAverage: { label: "Java", color: "var(--history-java)" }, bedrockAverage: { label: "Bedrock", color: "var(--history-bedrock)" } } satisfies ChartConfig;

type ChartPoint = HistoryPoint & { serverAverage?: number | null; serverPeak?: number | null; javaAverage?: number | null; bedrockAverage?: number | null; javaPeak?: number | null; bedrockPeak?: number | null };
function formatNumber(value: number | null, suffix = "") { return value === null ? "—" : `${Math.round(value).toLocaleString("es-ES")}${suffix}`; }
function formatDate(value: string | null, withYear = false) { if (!value) return "Sin datos"; return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function statusLabel(status: HistoryPointStatus) { return status === "online" ? "En línea" : status === "offline" ? "Sin respuesta" : status === "unknown" ? "Sin comprobar" : "Sin datos"; }
function statusClass(status: HistoryPointStatus) { return status === "online" ? "bg-success" : status === "offline" ? "bg-destructive" : status === "unknown" ? "bg-warning" : "bg-muted-foreground/30"; }
function seriesLabel(edition: HistorySeries["edition"] | HistoryEditionFilter) { return edition === "server" || edition === "all" ? "Servidor" : edition === "java" ? "Java" : "Bedrock"; }

function mergeChartData(seriesList: HistorySeries[]): ChartPoint[] {
  const byAt = new Map<string, ChartPoint>();
  for (const series of seriesList) for (const point of series.points) {
    const existing = byAt.get(point.at) ?? { ...point };
    if (series.edition === "server") { existing.serverAverage = point.averagePlayers; existing.serverPeak = point.peakPlayers; }
    else if (series.edition === "java") { existing.javaAverage = point.averagePlayers; existing.javaPeak = point.peakPlayers; }
    else { existing.bedrockAverage = point.averagePlayers; existing.bedrockPeak = point.peakPlayers; }
    existing.status = existing.status === "online" || point.status === "online" ? "online" : existing.status === "offline" || point.status === "offline" ? "offline" : point.status;
    existing.sampleCount = Math.max(existing.sampleCount ?? 0, point.sampleCount); existing.sourceChanged = existing.sourceChanged || point.sourceChanged; byAt.set(point.at, existing);
  }
  return [...byAt.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function Summary({ series }: { series: HistorySeries[] }) {
  const populated = series.filter((item) => item.summary.sampleCount > 0);
  const isServerView = series.some((item) => item.edition === "server");
  const average = populated.length ? populated.reduce((sum, item) => sum + (item.summary.averagePlayers ?? 0), 0) / populated.length : null;
  const peak = populated.length ? Math.max(...populated.map((item) => item.summary.peakPlayers ?? 0)) : null;
  const occupancy = populated.filter((item) => item.summary.averageOccupancyPct !== null);
  const coverage = populated.length ? populated.reduce((sum, item) => sum + item.summary.monitorCoveragePct, 0) / populated.length : 0;
  const items = [["Media", formatNumber(average), isServerView ? "máximo por intervalo" : "jugadores"], ["Pico", formatNumber(peak), "máximo observado"], ["Ocupación", occupancy.length ? `${Math.round(occupancy.reduce((sum, item) => sum + (item.summary.averageOccupancyPct ?? 0), 0) / occupancy.length)}%` : "—", "capacidad conocida"], ["Cobertura", `${Math.round(coverage)}%`, "ranuras monitorizadas"]];
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Resumen de jugadores">{items.map(([label, value, helper]) => <div key={label} className="rounded-lg border bg-muted/30 p-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-lg tabular-nums">{value}</strong><small className="mt-1 block text-xs text-muted-foreground">{helper}</small></div>)}</div>;
}

function AvailabilityRail({ data }: { data: PlayerHistoryResponse }) {
  const points = data.series.flatMap((series) => series.points.map((point) => ({ ...point, edition: series.edition }))).sort((a, b) => a.at.localeCompare(b.at));
  if (!points.length) return null;
  return <div className="grid gap-2" aria-label="Disponibilidad por intervalo"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Disponibilidad</span><span>{data.resolutionMinutes < 60 ? `cada ${data.resolutionMinutes} min` : `cada ${Math.round(data.resolutionMinutes / 60)} h`}</span></div><div className="flex h-3 gap-px overflow-hidden rounded-full" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(2px, 1fr))` }}>{points.map((point, index) => <span key={`${point.edition}-${point.at}-${index}`} className={statusClass(point.status)} title={`${formatDate(point.at)} · ${seriesLabel(point.edition)} · ${statusLabel(point.status)}`} />)}</div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />En línea</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />Sin respuesta</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />Sin comprobar</span></div></div>;
}

function DataTable({ data }: { data: PlayerHistoryResponse }) {
  return <Collapsible className="rounded-lg border"><CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between">Ver datos tabulares <span aria-hidden="true">⌄</span></Button></CollapsibleTrigger><CollapsibleContent className="border-t"><div className="max-h-72 overflow-auto"><Table><TableHeader><TableRow><TableHead>Momento</TableHead>{data.series.map((series) => <TableHead key={series.edition}>{seriesLabel(series.edition)}</TableHead>)}</TableRow></TableHeader><TableBody>{data.series[0]?.points.map((point, index) => <TableRow key={point.at}><TableHead scope="row" className="font-normal">{formatDate(point.at)}</TableHead>{data.series.map((series) => { const current = series.points[index]; return <TableCell key={`${series.edition}-${point.at}`}><span className={`mr-1.5 inline-block size-2 rounded-full ${statusClass(current?.status ?? "no_data")}`} />{current?.averagePlayers === null || current?.averagePlayers === undefined ? "—" : formatNumber(current.averagePlayers)}</TableCell>; })}</TableRow>)}</TableBody></Table></div></CollapsibleContent></Collapsible>;
}

export function PlayerHistoryCard({ serverId, initialData, mode = "public" }: Props) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState(initialData.period);
  const [edition, setEdition] = useState<HistoryEditionFilter>(initialData.edition);
  const [requestKey, setRequestKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (requestKey === 0) return; const controller = new AbortController(); fetch(`/api/servers/${serverId}/player-history?period=${period}&edition=${edition}`, { signal: controller.signal, headers: { accept: "application/json" } }).then(async (response) => { if (!response.ok) throw new Error("No se pudo cargar el histórico."); return response.json() as Promise<PlayerHistoryResponse>; }).then(setData).catch((reason: unknown) => { if (reason instanceof Error && reason.name === "AbortError") return; setError("No se pudo cargar el histórico ahora."); }).finally(() => setLoading(false)); return () => controller.abort(); }, [edition, period, requestKey, serverId]);
  const displaySeries = useMemo(() => { if (data.edition !== "all") return data.series; const aggregate = aggregateHistorySeries(data.series); return aggregate ? [aggregate] : []; }, [data]);
  const displayData = useMemo(() => ({ ...data, series: displaySeries }), [data, displaySeries]);
  const chartData = useMemo(() => mergeChartData(displaySeries), [displaySeries]);
  const isServerView = data.edition === "all";
  const hasData = displaySeries.some((series) => series.summary.sampleCount > 0);
  const hasSourceChange = displaySeries.some((series) => series.points.some((point) => point.sourceChanged));
  const lastSample = displaySeries.map((series) => series.summary.lastSampleAt).filter(Boolean).sort().at(-1) ?? null;
  const stale = lastSample ? new Date(data.generatedAt).getTime() - new Date(lastSample).getTime() > 45 * 60 * 1000 : false;
  const reload = (nextPeriod = period, nextEdition = edition) => { setLoading(true); setError(null); setPeriod(nextPeriod); setEdition(nextEdition); setRequestKey((current) => current + 1); };

  return <Card aria-labelledby={`${mode}-history-heading`}><CardHeader className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Activity className="size-4 text-primary" /> Jugadores conectados</CardTitle><p id={`${mode}-history-heading`} className="mt-2 text-sm text-muted-foreground">{isServerView ? "Actividad observada del servidor. No se suman endpoints que podrían compartir jugadores." : `Promedio de jugadores por intervalo en ${seriesLabel(data.edition)}.`}</p></div><div className="flex flex-wrap gap-2" aria-label="Filtros de histórico"><NativeSelect value={period} onChange={(event) => reload(event.target.value as typeof period, edition)}><option value="24h">{periodLabels["24h"]}</option><option value="7d">{periodLabels["7d"]}</option><option value="30d">{periodLabels["30d"]}</option><option value="90d">{periodLabels["90d"]}</option></NativeSelect><NativeSelect value={edition} onChange={(event) => reload(period, event.target.value as HistoryEditionFilter)}><option value="all">{editionLabels.all}</option><option value="java">{editionLabels.java}</option><option value="bedrock">{editionLabels.bedrock}</option></NativeSelect></div></CardHeader><CardContent className="grid gap-5">{error ? <Alert variant="destructive"><RefreshCcw className="size-4" /><AlertTitle>Error al cargar el histórico</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-2">{error}<Button type="button" variant="outline" size="sm" onClick={() => reload()}><RefreshCcw className="size-3.5" /> Reintentar</Button></AlertDescription></Alert> : null}{!error && !hasData ? <div className="flex items-start gap-3 rounded-lg border border-dashed p-6"><Info className="mt-0.5 size-5 text-muted-foreground" /><div><strong className="text-sm">Aún no hay histórico suficiente</strong><p className="mt-1 text-sm text-muted-foreground">Las muestras se recopilan cada 15 minutos. Vuelve cuando el monitor haya registrado actividad.</p></div></div> : null}{loading && hasData ? <Skeleton className="h-64 w-full" /> : null}{hasData && !loading ? <><Summary series={displaySeries} /><ChartContainer config={chartConfig} className="h-[260px] w-full aspect-auto"><LineChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }} accessibilityLayer><CartesianGrid stroke="var(--history-grid)" vertical={false} /><XAxis dataKey="at" tickFormatter={(value) => formatDate(value)} tick={{ fill: "var(--history-muted)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} /><YAxis allowDecimals={false} tick={{ fill: "var(--history-muted)", fontSize: 10 }} tickLine={false} axisLine={false} width={34} /><Tooltip content={<ChartTooltipContent labelFormatter={(value) => formatDate(String(value), true)} />} />{isServerView ? <Line type="monotone" dataKey="serverAverage" name="Servidor" connectNulls={false} stroke="var(--color-serverAverage)" strokeWidth={2.6} dot={false} isAnimationActive={false} /> : displaySeries.map((series) => <Line key={series.edition} type="monotone" dataKey={`${series.edition}Average`} name={seriesLabel(series.edition)} connectNulls={false} stroke={series.edition === "bedrock" ? "var(--color-bedrockAverage)" : "var(--color-javaAverage)"} strokeWidth={2.4} strokeDasharray={series.edition === "bedrock" ? "5 4" : undefined} dot={false} isAnimationActive={false} />)}</LineChart></ChartContainer><AvailabilityRail data={displayData} /><div className="grid gap-2 text-xs text-muted-foreground">{isServerView ? <span className="inline-flex items-center gap-2"><Info className="size-3.5" />Servidor: máximo observado por intervalo; no es una suma de Java y Bedrock.</span> : null}<span className="inline-flex items-center gap-2"><CheckCircle2 className={stale ? "size-3.5 text-warning" : "size-3.5 text-success"} />Última muestra: {formatDate(lastSample)}.{stale ? " El monitor puede estar retrasado." : ""}</span>{hasSourceChange ? <span className="inline-flex items-center gap-2"><Info className="size-3.5" />Se detectó un cambio de dirección; el histórico anterior se conserva separado.</span> : null}</div><DataTable data={displayData} /></> : null}<div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground"><Badge variant="outline">{isServerView ? "Servidor" : seriesLabel(data.edition)}</Badge><span>{loading ? "Actualizando…" : `${periodLabels[data.period]} · ${data.resolutionMinutes} min por punto`}</span></div></CardContent></Card>;
}
