import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Says where this order came from, and how much to trust it.
 *
 * The catalog is already honest about data it cannot vouch for — the monitor says "sin datos
 * recientes" rather than claiming a server is online because it was an hour ago. This is the same
 * habit applied to a ranking: it states that a model put these servers in this order, how many it
 * read, and when the match was poor enough that the order is the only part worth believing.
 *
 * It is deliberately one muted line rather than a card. The results are what the visitor came for,
 * and a filled, bordered banner above them would compete with the thing it is describing. Space and
 * weight do the work; `Alert` stays reserved for something actually going wrong.
 *
 * There is no per-server percentage on purpose. The scores move with how much the visitor wrote —
 * the same server scored 0.75 beside another and 0.32 alone — so a headline number would claim a
 * precision the measurement does not support. The ordering is the trustworthy part, so the ordering
 * is what is shown.
 */
export function AiRankingNotice({
  judged,
  approximate,
  partial,
  plainHref,
}: {
  judged: number;
  approximate: boolean;
  partial: boolean;
  plainHref: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
        Ordenado por IA
      </span>

      <span className="text-xs text-muted-foreground">
        {judged === 1 ? "1 servidor valorado" : `${judged} servidores valorados`} frente a lo que escribiste.
        {approximate ? " Ninguno encaja del todo; estos son los más cercanos." : null}
        {partial ? " No se pudieron valorar todos." : null}
      </span>

      <Link
        href={plainHref}
        prefetch={false}
        className="text-xs font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Ver sin IA
      </Link>
    </div>
  );
}
