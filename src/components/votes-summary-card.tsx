import type { ReactNode } from "react";
import { CalendarClock, Trophy } from "lucide-react";

import { CopyAddressButton } from "@/components/copy-address-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ServerVoteStats } from "@/lib/votes/service";
import { daysLeftLabel, formatVotes, monthlyReset } from "@/lib/votes/month";
import type { VotifierDeliveryHealth } from "@/lib/votes/votifier-display";

const overline = "text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground";

function votesWord(votes: number) {
  return votes === 1 ? "voto" : "votos";
}

function monthTrend(votes: number, previousVotes: number, previousMonthName: string) {
  if (previousVotes <= 0) return { text: "Primer mes con votos", tone: "text-muted-foreground" };
  const change = Math.round(((votes - previousVotes) / previousVotes) * 100);
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return {
    text: `${sign}${Math.abs(change).toLocaleString("es-ES")}% respecto a ${previousMonthName}`,
    tone: change > 0 ? "text-success" : change < 0 ? "text-danger" : "text-muted-foreground",
  };
}

function positionMove(position: number | null, previousPosition: number | null) {
  if (position === null) return { text: "Fuera del ranking", tone: "text-muted-foreground" };
  if (previousPosition === null) return { text: "Sin puesto el mes pasado", tone: "text-muted-foreground" };
  const places = previousPosition - position;
  if (places === 0) return { text: "Mantiene el puesto", tone: "text-muted-foreground" };
  const count = Math.abs(places);
  const word = count === 1 ? "puesto" : "puestos";
  return places > 0 ? { text: `Sube ${count} ${word}`, tone: "text-success" } : { text: `Baja ${count} ${word}`, tone: "text-danger" };
}

function Cell({ label, value, detail, detailTone = "text-muted-foreground", className = "" }: { label: string; value: ReactNode; detail?: ReactNode; detailTone?: string; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.25 bg-card px-4 py-3.5 ${className}`}>
      <p className={overline}>{label}</p>
      <div className="min-w-0 truncate font-extrabold tracking-tight tabular-nums">{value}</div>
      {detail ? <p className={`truncate text-xs ${detailTone}`}>{detail}</p> : null}
    </div>
  );
}

export function VotesSummaryCard({
  stats,
  voteUrl,
  delivery,
  now = new Date(),
}: {
  stats: ServerVoteStats;
  voteUrl: string;
  /** Present only when Votifier is configured: votes are not delivered anywhere otherwise. */
  delivery: VotifierDeliveryHealth | null;
  now?: Date;
}) {
  const reset = monthlyReset(now);
  const trend = monthTrend(stats.votes, stats.previousVotes, reset.previousMonthName);
  const move = positionMove(stats.position, stats.previousPosition);
  const gapLabel = stats.gap?.kind === "lead" ? "Al #2" : stats.gap && stats.position ? `Al #${stats.position - 1}` : "Distancia";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Trophy aria-hidden="true" className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Ranking</p>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground first-letter:uppercase">Votos de {reset.monthName}</h2>
          </div>
        </div>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:pt-1"><CalendarClock aria-hidden="true" className="size-3.5" />Se reinicia el {reset.resetLabel} · {daysLeftLabel(reset.daysLeft)}</p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <section aria-label="Cifras del mes" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <Cell
            label="Votos este mes"
            className="col-span-2 sm:col-span-1"
            value={<span className="text-[34px] leading-none">{formatVotes(stats.votes)}</span>}
            detail={trend.text}
            detailTone={trend.tone}
          />
          <Cell label="Posición" value={<span className="text-[1.0625rem]">{stats.position !== null ? `#${formatVotes(stats.position)}` : "—"}</span>} detail={move.text} detailTone={move.tone} />
          <Cell label="Hoy" value={<span className="text-[1.0625rem]">{formatVotes(stats.votesToday)} {votesWord(stats.votesToday)}</span>} />
          <Cell
            label={gapLabel}
            className="col-span-2 sm:col-span-1"
            value={<span className="text-[1.0625rem]">{!stats.gap ? "—" : stats.gap.kind === "lead" ? `+${formatVotes(stats.gap.votes)} ${votesWord(stats.gap.votes)}` : `faltan ${formatVotes(stats.gap.votes)} ${votesWord(stats.gap.votes)}`}</span>}
            detail={stats.gap?.kind === "lead" ? "de ventaja" : stats.gap ? "para subir un puesto" : "Aún no hay con quién comparar"}
          />
        </section>

        <Field>
          <FieldLabel htmlFor="vote-link">Enlace para votar</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Input id="vote-link" readOnly value={voteUrl} className="min-w-0 flex-1 font-mono text-xs" aria-describedby="vote-link-help" />
            <CopyAddressButton value={voteUrl} label="Copiar enlace" copiedLabel="Copiado" showIcon className="shrink-0 border-border bg-background text-foreground hover:bg-muted" />
          </div>
          <FieldDescription id="vote-link-help">Compártelo en tu Discord, en la web o en el comando /votar del servidor.</FieldDescription>
        </Field>

        {delivery ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            {delivery.attempted > 0
              ? <>Entregados <span className={`font-semibold tabular-nums ${delivery.delivered === delivery.attempted ? "text-success" : "text-warning"}`}>{formatVotes(delivery.delivered)} de {formatVotes(delivery.attempted)}</span> votos en las últimas 24 h.</>
              : "Ningún voto que entregar a Votifier en las últimas 24 h."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
