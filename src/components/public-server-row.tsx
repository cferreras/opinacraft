import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronRight, ClipboardCheck, Quote, Star, Users } from "lucide-react";

import { rankingGridTemplate, tableGridTemplate } from "@/app/servers/page";
import { StatusPill } from "@/components/server-status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerCountryCode } from "@/components/server-country-code";
import { ServerLogo } from "@/components/server-logo";
import { accessTypeLabel, accountModeLabel } from "@/lib/servers/access";
import { gameModeLabel } from "@/lib/servers/game-modes";
import { editionLabel, formatEndpoint, latencyClass, statusDot, statusLabel } from "@/lib/servers/format";
import type { CatalogServer } from "@/lib/servers/queries";
import type { CatalogRowRanking } from "@/lib/servers/catalog-filters";
import type { FeaturedOpinion } from "@/lib/votes/featured-opinions";
import { formatVotes } from "@/lib/votes/month";

export type RowRanking = CatalogRowRanking;

function ratingLabel(server: CatalogServer) {
  return server.reviewAverage?.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? null;
}

/** The measurement carries the weight of the row; its unit is context, so the two are typeset apart. */
function MetricValue({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-sm font-bold tracking-[-0.01em] ${className}`}>{children}</span>;
}

function MetricUnit({ children }: { children: ReactNode }) {
  return <span className="text-[0.6875rem] font-medium text-muted-foreground">{children}</span>;
}

function PlayersMetric({ monitor }: { monitor: CatalogServer["monitor"] }) {
  return (
    <>
      <MetricValue className={monitor.playersCurrent === null ? "text-muted-foreground" : ""}>{monitor.playersCurrent ?? "—"}</MetricValue>
      {monitor.playersMax !== null ? <MetricUnit>/{monitor.playersMax}</MetricUnit> : null}
    </>
  );
}

function LatencyMetric({ latencyMs }: { latencyMs: number | null }) {
  if (latencyMs === null) return <MetricValue className="text-muted-foreground">—</MetricValue>;
  return <><MetricValue className={latencyClass(latencyMs)}>{latencyMs}</MetricValue><MetricUnit>ms</MetricUnit></>;
}

/**
 * The count reads as `(36)` beside the average in the table, where the column header already says
 * what it is, and spells itself out on the card, where it stands alone under the average.
 */
function Rating({ server, className, stacked = false, emptyLabel = "Sin valoraciones" }: { server: CatalogServer; className: string; stacked?: boolean; emptyLabel?: string }) {
  const average = ratingLabel(server);
  if (average === null) return <p className={className}><span className="text-[0.6875rem] font-medium text-muted-foreground">{emptyLabel}</span></p>;

  return (
    <p className={className}>
      <span className="flex items-center gap-1 tabular-nums">
        <Star aria-hidden="true" className="size-3.5 fill-current text-warning" />
        <MetricValue>{average}</MetricValue>
      </span>
      {server.reviewCount > 0 ? <MetricUnit>{stacked ? `${server.reviewCount} opiniones` : `(${server.reviewCount})`}</MetricUnit> : null}
    </p>
  );
}

/** What the server *is*: the mode is the thing a visitor picks by, so it is tinted, not outlined. */
function ModePill({ children }: { children: ReactNode }) {
  return <Badge variant="outline" className="border-transparent bg-accent text-[0.625rem] font-semibold text-primary-ink">{children}</Badge>;
}

/** How the server lets you in: an icon carries the rule, so it never reads as another game mode. */
function TagPill({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <Badge variant="outline" className="text-[0.625rem]">{icon}{children}</Badge>;
}

/**
 * Client and version answer "can I connect from my launcher", not "what is this server about", so
 * they leave the pills for a column of their own that can be scanned down the page.
 */
function PlatformCell({ editions, version }: { editions: string; version: string | null }) {
  return (
    <div className="hidden min-w-0 wide:block">
      <span className="block truncate text-[0.71875rem] font-bold tracking-[-0.005em]">{editions}</span>
      <span className="mt-px block truncate text-[0.6875rem] font-medium tabular-nums text-muted-foreground">{version ?? "—"}</span>
    </div>
  );
}

/**
 * The address and its copy button are one field rather than a value with a button beside it: the
 * affordance belongs to the value, so hovering the row lifts the whole field instead of an icon.
 */
function AddressCell({ value, className }: { value: string; className: string }) {
  return (
    <div className={`hidden h-7 min-w-0 items-center rounded-md border bg-muted/70 pl-2.5 pr-px transition-colors group-hover:border-foreground/15 group-hover:bg-card ${className}`}>
      <code className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-muted-foreground transition-colors group-hover:text-foreground">{value}</code>
      <CopyAddressButton value={value} iconOnly className="relative z-1 size-6 shrink-0 rounded-sm text-muted-foreground/65 group-hover:text-foreground" />
    </div>
  );
}

function AddressField({ value, className = "" }: { value: string; className?: string }) {
  return (
    <div className={`flex h-11 min-w-0 items-center gap-1 rounded-lg border bg-muted/40 pl-3 pr-1 ${className}`}>
      <code className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-muted-foreground">{value}</code>
      <CopyAddressButton value={value} iconOnly className="relative z-1 size-9" />
    </div>
  );
}

/**
 * One labelled cell of the card's metrics strip — the label is what the table gets from its header.
 * `stacked` is for the pair that does not fit on one line: a client plus a version like `Paper 1.21.7`
 * truncates the client down to a letter when they share a row.
 */
function StripCell({ label, stacked = false, children }: { label: string; stacked?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5 py-2">
      <span className="text-[0.5625rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <p className={`flex min-w-0 tabular-nums ${stacked ? "flex-col items-start" : "items-baseline gap-1 truncate"}`}>{children}</p>
    </div>
  );
}

/**
 * The place in the ranking. The podium is tinted so the top of the list reads as a result, not as
 * the first rows of a table; every other place stays quiet so the votes beside it lead.
 */
function PositionMark({ position, className = "" }: { position: number; className?: string }) {
  const podium = position <= 3;
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-extrabold tabular-nums tracking-[-0.02em] ${podium ? "bg-accent text-primary-ink" : "text-muted-foreground"} ${className}`}>
      <span className="sr-only">Puesto </span>{position}
    </span>
  );
}

function MiniStars({ rating }: { rating: number }) {
  return (
    <span role="img" className="inline-flex items-center gap-px text-rating" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => <Star key={star} aria-hidden="true" className={`size-2.75 fill-current ${star <= rating ? "" : "text-muted-foreground/25"}`} />)}
    </span>
  );
}

/**
 * What players say, on the card itself: the score, how many said it, and one of them in their own
 * words. It takes the place of the owner's description, which the ficha still carries in full.
 */
function OpinionQuote({ server, opinion }: { server: CatalogServer; opinion: FeaturedOpinion }) {
  return (
    <figure className="rounded-lg bg-background/55 px-3 py-2.5 lg:hidden">
      <p className="flex items-center gap-1.5 text-[0.6875rem] tabular-nums">
        {/* The stars sit beside the server's average, so they draw that average rather than the
            quoted review's own score, which is the best one and would contradict the number. */}
        <MiniStars rating={Math.round(server.reviewAverage ?? opinion.rating)} />
        <span className="font-bold">{ratingLabel(server)}</span>
        <span className="text-muted-foreground">· {server.reviewCount} {server.reviewCount === 1 ? "opinión" : "opiniones"}</span>
      </p>
      <blockquote className="mt-1 line-clamp-2 text-[0.78125rem] leading-normal text-foreground/80">“{opinion.excerpt}”</blockquote>
      <figcaption className="mt-0.5 text-[0.6875rem] font-medium text-muted-foreground">— {opinion.authorName}</figcaption>
    </figure>
  );
}

export function PublicServerRow({ server, ranking }: { server: CatalogServer; ranking?: RowRanking }) {
  const endpoint = server.endpoints.find((item) => item.edition === "java") ?? server.endpoints[0];
  const endpointAddress = endpoint ? formatEndpoint(endpoint) : server.slug;
  const editions = editionLabel(server);
  const restrictedAccess = server.accessType === "whitelist";
  const openAccounts = server.accountMode !== "premium_only";

  const tags: Array<{ key: string; node: ReactNode }> = [
    ...server.gameModes.slice(0, 2).map((mode) => ({ key: `mode-${mode}`, node: <ModePill>{gameModeLabel(mode)}</ModePill> })),
    ...(restrictedAccess ? [{ key: "access", node: <TagPill icon={<ClipboardCheck aria-hidden="true" className="size-3" />}>{accessTypeLabel(server.accessType)}</TagPill> }] : []),
    ...(openAccounts ? [{ key: "accounts", node: <TagPill icon={<Users aria-hidden="true" className="size-3" />}>{accountModeLabel(server.accountMode)}</TagPill> }] : []),
  ];

  return (
    // `minmax(0,1fr)` rather than the implicit `auto` track: a long address would otherwise widen
    // the card past the viewport instead of truncating inside its field.
    <article className={`group relative grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-xl border-none bg-card p-3.5 ring-1 ring-foreground/10 transition-colors has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring/50 sm:p-4 ${ranking ? rankingGridTemplate : tableGridTemplate} lg:h-16 lg:items-center lg:gap-x-3.5 lg:gap-y-0 lg:rounded-none lg:border-t lg:border-solid lg:bg-transparent lg:px-4.5 lg:py-0 lg:ring-0 lg:first-of-type:border-t-0 lg:hover:bg-muted/55`}>
      {ranking ? (ranking.position ? <PositionMark position={ranking.position} className="hidden size-7 text-sm lg:inline-flex" /> : <span aria-hidden="true" className="hidden lg:block" />) : null}
      <div className="flex min-w-0 items-start gap-3 lg:items-center lg:gap-2.5">
        <div className="relative shrink-0">
          <ServerLogo name={server.name} media={server.media} className="size-11 rounded-md lg:size-8.5 lg:rounded-lg" />
          {/* On the card the place rides on the logo's corner, where the column would be. */}
          {ranking?.position ? <PositionMark position={ranking.position} className={`absolute -left-2 -top-2 h-5 min-w-5 rounded-full px-1 text-[0.6875rem] ring-2 ring-card lg:hidden ${ranking.position <= 3 ? "" : "bg-muted"}`} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 lg:gap-1.5">
            {/* The table row has no room for the pill, so the status becomes a dot that keeps its label. */}
            <span className="hidden shrink-0 items-center lg:inline-flex">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${statusDot(server.aggregateStatus)}`} />
              <span className="sr-only">{statusLabel(server.aggregateStatus)}</span>
            </span>
            {/* The name's link stretches over the whole row, so anywhere that is not the address,
                its copy button or the card's button opens the server. One named link still, not a
                row full of them: the overlay is a pseudo-element, so nothing is added to the page. */}
            <h3 className="truncate text-sm font-semibold lg:font-bold lg:tracking-[-0.01em]"><Link href={`/servers/${server.slug}`} className="transition-colors after:absolute after:inset-0 hover:text-primary focus-visible:text-primary focus-visible:outline-none">{server.name}</Link></h3>
            <ServerCountryCode code={server.country} className="hidden lg:inline" />
          </div>

          <div className="mt-1.5 flex items-center gap-2 lg:hidden">
            <ServerCountryCode code={server.country} />
            <StatusPill status={server.aggregateStatus} />
          </div>

          {ranking?.opinion ? (
            // In the ranking the second line quotes a player instead of listing the modes: the
            // modes are a filter away, what people think of the server is not.
            <p className="mt-1 hidden min-w-0 items-center gap-1.5 text-[0.71875rem] text-muted-foreground lg:flex">
              <Quote aria-hidden="true" className="size-3 shrink-0 fill-current text-muted-foreground/40" />
              <span className="truncate">{ranking.opinion.excerpt}</span>
            </p>
          ) : tags.length > 0 ? (
            <div className="mt-1.5 hidden items-center gap-1.5 overflow-hidden lg:flex">
              {/* The columns leave the name about 240px: a third pill would be cut mid-shape, and the
                  card below `lg` still carries the whole set. */}
              {tags.slice(0, 2).map((tag) => <Fragment key={tag.key}>{tag.node}</Fragment>)}
            </div>
          ) : null}
        </div>
        {ranking ? (
          <p className="flex shrink-0 flex-col items-end gap-px tabular-nums lg:hidden">
            <MetricValue className="text-primary-ink">{formatVotes(ranking.votes)}</MetricValue>
            <MetricUnit>votos</MetricUnit>
          </p>
        ) : <Rating server={server} stacked className="flex shrink-0 flex-col items-end gap-px lg:hidden" />}
      </div>

      {ranking?.opinion ? <OpinionQuote server={server} opinion={ranking.opinion} /> : (
        <>
          {/* The description is what the card has instead of columns, so it stays on the card. */}
          <p className="line-clamp-2 text-[0.78125rem] leading-normal text-muted-foreground lg:hidden">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>
          {ranking ? <Rating server={server} emptyLabel="Sin opiniones todavía" className="flex items-center gap-1 lg:hidden" /> : null}
        </>
      )}

      {tags.length > 0 ? (
        <div className="flex max-w-full flex-wrap items-center gap-1.5 overflow-hidden lg:hidden">
          {tags.map((tag) => <Fragment key={tag.key}>{tag.node}</Fragment>)}
        </div>
      ) : null}

      {/* The ranking gives the edition column to the votes, and the address waits for the room. */}
      {ranking ? null : <PlatformCell editions={editions} version={server.monitor.version} />}
      <AddressCell value={endpointAddress} className={ranking ? "wide:flex" : "lg:flex"} />
      <p className="hidden items-baseline justify-end gap-1 tabular-nums lg:flex"><PlayersMetric monitor={server.monitor} /></p>
      <p className="hidden items-baseline justify-end gap-1 tabular-nums lg:flex"><LatencyMetric latencyMs={server.monitor.latencyMs} /></p>
      <Rating server={server} emptyLabel="Sin valorar" className="hidden items-center justify-end gap-1 whitespace-nowrap lg:flex" />
      {ranking ? <p className="hidden items-baseline justify-end tabular-nums lg:flex"><MetricValue className="font-extrabold text-primary-ink">{formatVotes(ranking.votes)}</MetricValue></p> : null}
      {/* Decoration, not navigation: the name's link already covers the row. It used to be an
          anchor with no text and no accessible name, which is a link as far as a crawler is
          concerned -- a second, nameless vote for the same URL from every row. */}
      <span aria-hidden="true" className="hidden items-center justify-end text-muted-foreground/45 transition-colors group-hover:text-primary lg:flex">
        <ChevronRight className="size-4" />
      </span>

      <div className="flex items-stretch overflow-hidden rounded-lg bg-background/55 lg:hidden [&>*+*]:border-l">
        <StripCell label="Jugadores"><PlayersMetric monitor={server.monitor} /></StripCell>
        <StripCell label="Ping"><LatencyMetric latencyMs={server.monitor.latencyMs} /></StripCell>
        <StripCell label="Edición" stacked>
          <span className="max-w-full truncate text-[0.78125rem] font-bold">{editions}</span>
          <span className="max-w-full truncate text-[0.6875rem] font-medium text-muted-foreground">{server.monitor.version ?? "—"}</span>
        </StripCell>
      </div>

      <div className="flex items-center gap-2 lg:hidden">
        <AddressField value={endpointAddress} className="flex-1 bg-background/55" />
        <Button asChild variant="outline" size="lg" className="relative z-1 h-11 shrink-0 px-3.5"><Link href={`/servers/${server.slug}`}>Ver ficha</Link></Button>
      </div>
    </article>
  );
}
