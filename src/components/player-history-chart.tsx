"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatPlayerHistoryTooltipValue, getPlayerHistoryChartTickMode, getPlayerHistoryChartTicks, trimTrailingEmptyChartPoints, type PlayerHistoryChartPoint } from "@/lib/servers/player-history-chart";
import type { HistoryPeriod } from "@/lib/servers/player-history";
import { useBrowserDateFormatter } from "@/components/localized-timestamp";

const chartConfig = { serverPeak: { label: "Máximo observado", color: "var(--history-java)" } } satisfies ChartConfig;
const tick = { fill: "var(--history-muted)", fontSize: "0.6875rem" };

export function PlayerHistoryChart({ data, period }: { data: PlayerHistoryChartPoint[]; period: HistoryPeriod }) {
  const dateFormatter = useBrowserDateFormatter();
  const visibleData = trimTrailingEmptyChartPoints(data);
  const tickMode = getPlayerHistoryChartTickMode(period);
  const ticks = getPlayerHistoryChartTicks(visibleData, 8, tickMode === "date" ? (point) => new Date(point.at).toDateString() : undefined);
  // The busiest interval gets a marker, so the headline "Pico" figure has a place on the curve.
  const peak = visibleData.reduce<PlayerHistoryChartPoint | null>((best, point) => ((point.serverPeak ?? -1) > (best?.serverPeak ?? -1) ? point : best), null);
  return (
    <ChartContainer config={chartConfig} className="h-[9rem] w-full aspect-auto sm:h-[233px]">
      <AreaChart data={visibleData} margin={{ top: 10, right: 12, left: 2, bottom: 0 }} accessibilityLayer desc="Máximo de jugadores conectados observado en el servidor">
        <CartesianGrid stroke="var(--history-grid)" vertical={false} />
        <XAxis dataKey="at" ticks={ticks} interval={0} tickFormatter={(value) => dateFormatter.format(String(value), tickMode)} tick={tick} tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} />
        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} tickMargin={8} width={42} />
        <Tooltip cursor={{ stroke: "var(--history-muted)", strokeDasharray: "2 3" }} content={<ChartTooltipContent labelFormatter={(value) => dateFormatter.format(String(value), "time")} formatter={(value) => <span className="font-mono font-medium text-foreground tabular-nums">{formatPlayerHistoryTooltipValue(value)}</span>} />} />
        <Area type="monotone" dataKey="serverPeak" name="Máximo observado" stroke="var(--color-serverPeak)" strokeWidth={2} fill="var(--color-serverPeak)" fillOpacity={0.1} dot={false} activeDot={{ r: 4.5, strokeWidth: 2, fill: "var(--card)" }} isAnimationActive={false} />
        {peak ? <ReferenceLine x={peak.at} stroke="var(--foreground)" strokeDasharray="2 3" ifOverflow="extendDomain" /> : null}
        {peak ? <ReferenceDot x={peak.at} y={peak.serverPeak ?? 0} r={4.5} fill="var(--card)" stroke="var(--color-serverPeak)" strokeWidth={2} /> : null}
      </AreaChart>
    </ChartContainer>
  );
}
