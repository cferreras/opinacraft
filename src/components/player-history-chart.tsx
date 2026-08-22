"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { getPlayerHistoryChartTicks, trimTrailingEmptyChartPoints, type PlayerHistoryChartPoint } from "@/lib/servers/player-history-chart";
import { useBrowserDateFormatter } from "@/components/localized-timestamp";

const chartConfig = { serverPeak: { label: "Máximo observado", color: "var(--history-java)" } } satisfies ChartConfig;

export function PlayerHistoryChart({ data }: { data: PlayerHistoryChartPoint[] }) {
  const dateFormatter = useBrowserDateFormatter();
  const visibleData = trimTrailingEmptyChartPoints(data);
  const ticks = getPlayerHistoryChartTicks(visibleData);
  return <ChartContainer config={chartConfig} className="h-[276px] w-full aspect-auto"><LineChart data={visibleData} margin={{ top: 10, right: 12, left: 2, bottom: 0 }} accessibilityLayer desc="Máximo de jugadores conectados observado en el servidor"><CartesianGrid stroke="var(--history-grid)" vertical={false} /><XAxis dataKey="at" ticks={ticks} interval={0} tickFormatter={(value) => dateFormatter.format(String(value), "time")} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} /><YAxis allowDecimals={false} tick={{ fill: "var(--history-muted)", fontSize: "0.625rem" }} tickLine={false} axisLine={false} tickMargin={8} width={42} /><Tooltip cursor={{ stroke: "var(--history-grid)", strokeDasharray: "4 4" }} content={<ChartTooltipContent labelFormatter={(value) => dateFormatter.format(String(value), "datetime")} />} /><Line type="monotone" dataKey="serverPeak" name="Máximo observado" connectNulls={false} stroke="var(--color-serverPeak)" strokeWidth={2.75} strokeLinecap="round" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={false} /></LineChart></ChartContainer>;
}
