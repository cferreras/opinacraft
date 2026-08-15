"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { PlayerHistoryChartPoint } from "@/lib/servers/player-history-chart";

const chartConfig = { serverPeak: { label: "Máximo observado", color: "var(--history-java)" } } satisfies ChartConfig;

function formatDate(value: string | null, withYear = false) {
  if (!value) return "Sin datos";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC", ...(withYear ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function PlayerHistoryChart({ data }: { data: PlayerHistoryChartPoint[] }) {
  return <ChartContainer config={chartConfig} className="h-[276px] w-full aspect-auto"><LineChart data={data} margin={{ top: 10, right: 12, left: 2, bottom: 0 }} accessibilityLayer desc="Máximo de jugadores conectados observado en el servidor"><CartesianGrid stroke="var(--history-grid)" vertical={false} /><XAxis dataKey="at" tickFormatter={(value) => formatDate(value)} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} /><YAxis allowDecimals={false} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={8} width={42} /><Tooltip cursor={{ stroke: "var(--history-grid)", strokeDasharray: "4 4" }} content={<ChartTooltipContent labelFormatter={(value) => formatDate(String(value), true)} />} /><Line type="monotone" dataKey="serverPeak" name="Máximo observado" connectNulls={false} stroke="var(--color-serverPeak)" strokeWidth={2.75} strokeLinecap="round" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={false} /></LineChart></ChartContainer>;
}
