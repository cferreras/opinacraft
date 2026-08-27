"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { getPlayerHistoryChartTickMode, getPlayerHistoryChartTicks, trimTrailingEmptyChartPoints, type PlayerHistoryChartPoint } from "@/lib/servers/player-history-chart";
import type { HistoryPeriod } from "@/lib/servers/player-history";
import { useBrowserDateFormatter } from "@/components/localized-timestamp";

const chartConfig = { serverPeak: { label: "Máximo observado", color: "var(--history-java)" } } satisfies ChartConfig;

export function PlayerHistoryChart({ data, period }: { data: PlayerHistoryChartPoint[]; period: HistoryPeriod }) {
  const dateFormatter = useBrowserDateFormatter();
  const visibleData = trimTrailingEmptyChartPoints(data);
  const tickMode = getPlayerHistoryChartTickMode(period);
  const ticks = getPlayerHistoryChartTicks(visibleData, 8, tickMode === "date" ? (point) => new Date(point.at).toDateString() : undefined);
  return <ChartContainer config={chartConfig} className="h-[276px] w-full aspect-auto"><BarChart data={visibleData} margin={{ top: 10, right: 12, left: 2, bottom: 0 }} barCategoryGap="20%" accessibilityLayer desc="Máximo de jugadores conectados observado en el servidor"><CartesianGrid stroke="var(--history-grid)" vertical={false} /><XAxis dataKey="at" ticks={ticks} interval={0} tickFormatter={(value) => dateFormatter.format(String(value), tickMode)} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} /><YAxis allowDecimals={false} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={8} width={42} /><Tooltip cursor={{ fill: "var(--history-grid)", fillOpacity: 0.18 }} content={<ChartTooltipContent labelFormatter={(value) => dateFormatter.format(String(value), "datetime")} />} /><Bar dataKey="serverPeak" name="Máximo observado" fill="var(--color-serverPeak)" radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive={false} /></BarChart></ChartContainer>;
}
