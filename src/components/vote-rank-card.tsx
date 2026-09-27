import Link from "next/link";
import { ArrowBigUp, CalendarDays, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { daysLeftLabel, formatVotes, monthlyReset, VOTE_COOLDOWN_HOURS } from "@/lib/votes/month";
import { rankTrend, votesThisMonthLabel } from "@/lib/votes/rank-copy";

const trendIcons = { up: TrendingUp, down: TrendingDown, same: Minus } as const;

/** The server's place in this month's ranking and the way to climb it, at the top of the rail. */
export function VoteRankCard({ serverName, slug, votes, position, previousPosition, className = "" }: {
  serverName: string;
  slug: string;
  votes: number;
  position: number | null;
  previousPosition: number | null;
  className?: string;
}) {
  const reset = monthlyReset();
  const trend = rankTrend(position, previousPosition, reset.previousMonthName);
  const TrendIcon = trend ? trendIcons[trend.direction] : null;
  return (
    <Card className={`gap-0 py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_21px_-13px_rgb(0_0_0/0.18)] ${className}`} aria-labelledby="vote-rank-heading">
      <div className="grid gap-3.25 p-5.25">
        <h2 id="vote-rank-heading" className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">Ranking de {reset.monthName}</h2>
        <div className="flex items-center gap-3.25">
          <p className="flex size-18 shrink-0 items-center justify-center rounded-xl bg-accent text-[1.625rem] font-extrabold tracking-tight text-primary-ink tabular-nums">
            {position === null ? <span aria-label="Sin puesto">—</span> : <><span className="sr-only">Puesto </span>#{position.toLocaleString("es-ES")}</>}
          </p>
          <div className="grid min-w-0 gap-1">
            <p className="text-[0.8125rem] text-muted-foreground">
              <span className="text-[1.375rem] font-extrabold leading-none tracking-tight text-foreground tabular-nums">{formatVotes(votes)}</span>{" "}
              {votesThisMonthLabel(votes)}
            </p>
            {trend && TrendIcon ? (
              <p className={`flex items-center gap-1.25 text-xs font-bold ${trend.direction === "up" ? "text-primary-ink" : "text-muted-foreground"}`}>
                <TrendIcon aria-hidden="true" className="size-3.5 shrink-0" />
                {trend.label}
              </p>
            ) : null}
          </div>
        </div>
        <Button asChild className="mt-1 h-13 w-full gap-2 text-[0.9375rem] font-extrabold">
          <Link href={`/servers/${slug}/votar`}>
            <ArrowBigUp aria-hidden="true" className="size-5" />
            <span className="truncate">Votar por {serverName}</span>
          </Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">Gratis y sin cuenta · un voto cada {VOTE_COOLDOWN_HOURS} h</p>
      </div>
      <p className="flex items-center gap-2 border-t px-5.25 py-3.25 text-xs text-muted-foreground">
        <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
        <span>El ranking se reinicia el {reset.resetLabel} · {daysLeftLabel(reset.daysLeft)}</span>
      </p>
    </Card>
  );
}
