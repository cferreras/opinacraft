import type { ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CircleX, ExternalLink, FilePen, Plus, ShieldCheck, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ManagedServerRow, managedTableGridTemplate } from "@/components/managed-server-row";
import { ManagedServersToolbar } from "@/components/managed-servers-toolbar";
import { SiteHeader } from "@/components/site-header";
import { requireServerSession } from "@/lib/session";
import { getCachedMonitorStatuses } from "@/lib/servers/cached-queries";
import {
  collectManagedServerNotices,
  filterManagedServers,
  isManagedServerFilter,
  isManagedServerSort,
  managedServerFilterCounts,
  sortManagedServers,
  summarizeManagedServers,
  type ManagedServerNotice,
} from "@/lib/servers/managed-servers";
import { isMonitorApiConfigured } from "@/lib/servers/monitor-api-client";
import { applyMonitorStatuses, listManagedServers } from "@/lib/servers/queries";

type Props = { searchParams?: Promise<{ deleted?: string; q?: string; filter?: string; sort?: string }> };

const MAX_VISIBLE_NOTICES = 4;

const noticeIcons = { danger: CircleX, warning: ShieldCheck, neutral: FilePen } as const;
const noticeTones = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-muted text-muted-foreground",
} as const;

function formatCount(value: number) {
  return value.toLocaleString("es-ES");
}

function SummaryMetric({ label, value, detail, tone = "", action }: { label: string; value: string; detail?: string; tone?: string; action?: ReactNode }) {
  return (
    <div className="p-4 lg:px-5">
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tracking-tight tabular-nums ${tone}`}>{value}</span>
        {detail ? <span className="min-w-0 truncate text-xs text-muted-foreground">{detail}</span> : null}
        {action}
      </dd>
    </div>
  );
}

function NoticeItem({ notice }: { notice: ManagedServerNotice }) {
  const Icon = noticeIcons[notice.tone];

  return (
    <li className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0 sm:flex-nowrap lg:px-5">
      <span aria-hidden="true" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${noticeTones[notice.tone]}`}><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold">{notice.title}</strong>
        <span className="mt-0.5 block text-xs text-muted-foreground">{notice.detail}</span>
      </span>
      <Button asChild variant="outline" size="sm" className="h-8 shrink-0"><Link href={notice.href}>{notice.actionLabel}</Link></Button>
    </li>
  );
}

export default async function ManagedServersPage({ searchParams }: Props) {
  await connection();
  const session = await requireServerSession("/dashboard/servers");
  const [databaseServers, query] = await Promise.all([
    listManagedServers(session.user.id),
    searchParams ?? Promise.resolve<{ deleted?: string; q?: string; filter?: string; sort?: string }>({}),
  ]);
  let servers = databaseServers;

  if (isMonitorApiConfigured() && servers.length > 0) {
    try {
      const states = await getCachedMonitorStatuses(servers.map((server) => server.id)) ?? [];
      servers = applyMonitorStatuses(servers, states);
    } catch (error) {
      console.error("[monitor] managed status cache unavailable", error instanceof Error ? error.name : "unknown");
    }
  }

  const summary = summarizeManagedServers(servers);
  const notices = collectManagedServerNotices(servers);
  const counts = managedServerFilterCounts(servers);
  const filter = isManagedServerFilter(query?.filter) ? query.filter : "all";
  const sort = isManagedServerSort(query?.sort) ? query.sort : "status";
  const search = query?.q ?? "";
  const visibleServers = sortManagedServers(filterManagedServers(servers, { query: search, filter }), sort);
  const hasActiveFilters = Boolean(search.trim()) || filter !== "all";
  const publicationDetail = [
    `${formatCount(summary.published)} publicados`,
    summary.hidden > 0 ? `${formatCount(summary.hidden)} ocultos` : null,
    summary.draft > 0 ? `${formatCount(summary.draft)} borradores` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-8">
        <section aria-labelledby="managed-servers-heading">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Espacio de gestión</p>
              <h1 id="managed-servers-heading" className="mt-2 text-4xl font-semibold tracking-tight">Tus servidores</h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">Salud del monitor, estado de publicación y datos públicos de tus comunidades, en una sola vista.</p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button variant="outline" size="lg" asChild className="bg-card"><Link href="/">Explorar directorio <ExternalLink className="size-4" /></Link></Button>
              <Button size="lg" asChild><Link href="/servers/new"><Plus className="size-4" /> Añadir servidor</Link></Button>
            </div>
          </div>

          {query?.deleted ? <Alert className="mt-5"><AlertDescription>El servidor se ha eliminado correctamente.</AlertDescription></Alert> : null}

          {servers.length > 0 ? (
            <dl className="mt-7 grid divide-y rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
              <SummaryMetric label="Servidores gestionados" value={formatCount(summary.total)} detail={publicationDetail} />
              <SummaryMetric label="En línea ahora" value={formatCount(summary.online)} detail={`de ${formatCount(summary.total)}${summary.unknown > 0 ? ` · ${formatCount(summary.unknown)} sin datos` : ""}`} tone="text-success" />
              <SummaryMetric label="Jugadores conectados" value={formatCount(summary.playersCurrent)} detail={summary.playersMax > 0 ? `de ${formatCount(summary.playersMax)} plazas` : undefined} />
              <SummaryMetric
                label="Requieren atención"
                value={formatCount(summary.attention)}
                tone={summary.attention > 0 ? "text-warning" : undefined}
                action={summary.attention > 0 ? <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs font-semibold"><Link href="#avisos">Ver avisos</Link></Button> : <span className="text-xs text-muted-foreground">todo en orden</span>}
              />
            </dl>
          ) : null}

          {notices.length > 0 ? (
            <section id="avisos" aria-labelledby="avisos-heading" className="mt-6 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3.5 lg:px-5">
                <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
                <h2 id="avisos-heading" className="text-sm font-semibold">Requiere tu atención</h2>
                <span className="inline-flex h-5 items-center rounded-full bg-warning-soft px-2 text-xs font-medium text-warning">{notices.length === 1 ? "1 aviso" : `${formatCount(notices.length)} avisos`}</span>
              </div>
              <ul>
                {notices.slice(0, MAX_VISIBLE_NOTICES).map((notice) => <NoticeItem key={notice.id} notice={notice} />)}
              </ul>
              {notices.length > MAX_VISIBLE_NOTICES ? (
                <p className="border-t px-4 py-2.5 text-xs text-muted-foreground lg:px-5">Y {formatCount(notices.length - MAX_VISIBLE_NOTICES)} avisos más en las fichas de gestión.</p>
              ) : null}
            </section>
          ) : null}

          {servers.length === 0 ? (
            <Empty className="mt-6 rounded-xl border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Plus /></EmptyMedia>
                <EmptyTitle>Todavía no gestionas ningún servidor</EmptyTitle>
                <EmptyDescription>Añade tu primera comunidad de Minecraft para crear su ficha pública, activar el monitor de estado y empezar a recibir opiniones.</EmptyDescription>
              </EmptyHeader>
              <Button asChild><Link href="/servers/new"><Plus className="size-4" /> Añadir servidor</Link></Button>
            </Empty>
          ) : (
            <section className="mt-8" aria-labelledby="managed-results-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="managed-results-heading" className="text-xl font-semibold tracking-tight">Comunidades gestionadas</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Cada fila reúne la salud del monitor y el estado público de un servidor.</p>
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">Mostrando {formatCount(visibleServers.length)} de {formatCount(servers.length)}</p>
              </div>

              <div className="mt-4"><ManagedServersToolbar query={search} filter={filter} sort={sort} counts={counts} /></div>

              {visibleServers.length === 0 ? (
                <Empty className="mt-4 rounded-xl border">
                  <EmptyHeader>
                    <EmptyTitle>Ningún servidor coincide con este filtro</EmptyTitle>
                    <EmptyDescription>Prueba con otro estado o borra el texto de búsqueda.</EmptyDescription>
                  </EmptyHeader>
                  <Button variant="outline" asChild className="bg-card"><Link href="/dashboard/servers">Limpiar filtros</Link></Button>
                </Empty>
              ) : (
                <div className="mt-4 flex flex-col gap-2 lg:block lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:bg-card lg:ring-1 lg:ring-foreground/10">
                  <div aria-hidden="true" className={`hidden h-10 items-center border-b bg-muted/50 px-5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:grid ${managedTableGridTemplate}`}>
                    <span>Servidor</span>
                    <span>Estado</span>
                    <span>Jugadores</span>
                    <span>Versión</span>
                    <span>Ping</span>
                    <span>Publicación</span>
                    <span />
                  </div>
                  {visibleServers.map((server) => <ManagedServerRow key={server.id} server={server} />)}
                </div>
              )}

              {hasActiveFilters ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Filtro activo. <Link href="/dashboard/servers" className="font-semibold text-primary hover:underline">Ver todos los servidores</Link>
                </p>
              ) : null}
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
