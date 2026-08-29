import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CatalogFilterBar } from "@/components/catalog-filter-bar";
import { PromotedServersSection } from "@/components/promoted-servers-section";
import { PublicServerRow } from "@/components/public-server-row";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCachedCatalogVersions, getCachedMonitorCatalogPage, getCachedMonitorStatuses, getCachedPublishedServerPage } from "@/lib/servers/cached-queries";
import { isMonitorApiConfigured } from "@/lib/servers/monitor-api-client";
import {
  isMonitorDependentCatalogQuery,
  isPublicServerTableSort,
  monitorFromApi,
  PUBLIC_SERVER_PAGE_SIZE,
  type PublicServerSort,
  type PublicServerSortDirection,
  type PublicServerTableSort,
} from "@/lib/servers/queries";
import { getServerResultsSummary } from "@/lib/servers/result-summary";
import { buildCatalogHref, catalogPath } from "@/lib/servers/catalog-route";
import { catalogAccessOptions, catalogSortOptions, catalogStatusOptions, parseCatalogAccessParam } from "@/lib/servers/catalog-filters";
import { gameModeLabel, parseGameModeParam } from "@/lib/servers/game-modes";
import { parseCountryParam, serverCountryLabel } from "@/lib/servers/countries";
import { parseVersionParam } from "@/lib/servers/minecraft-version";

export const metadata: Metadata = { title: "Servidores Minecraft | OpinaCraft", description: "Descubre, compara y únete a comunidades de Minecraft en OpinaCraft.", alternates: { canonical: catalogPath }, openGraph: { title: "Servidores Minecraft | OpinaCraft", description: "Descubre, compara y únete a comunidades de Minecraft en OpinaCraft.", type: "website" } };
export const tableGridTemplate = "lg:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_8rem]";

const tableColumns: Array<{ key: PublicServerTableSort; label: string }> = [
  { key: "name", label: "Servidor" },
  { key: "players", label: "Jugadores" },
  { key: "latency", label: "Ping" },
  { key: "rating", label: "Valoración" },
];

function orderSummary(activeSort: PublicServerTableSort | undefined, direction: PublicServerSortDirection, fallback: PublicServerSort, hasQuery: boolean) {
  if (hasQuery && !activeSort) return "Ordenado por relevancia";
  if (!activeSort) return `Ordenado por ${catalogSortOptions.find((option) => option.value === fallback)?.label.toLowerCase() ?? "valoración"}`;
  const column = tableColumns.find((item) => item.key === activeSort);
  return `Ordenado por ${(column?.label ?? "tabla").toLowerCase()}, de ${direction === "asc" ? "menor a mayor" : "mayor a menor"}`;
}

function SortableColumnHeader({
  column,
  activeSort,
  direction,
  href,
}: {
  column: (typeof tableColumns)[number];
  activeSort?: PublicServerTableSort;
  direction: PublicServerSortDirection;
  href: string;
}) {
  const isActive = activeSort === column.key;
  const nextDirection = isActive && direction === "asc" ? "desc" : "asc";
  const nextDirectionLabel = nextDirection === "asc" ? "ascendente" : "descendente";
  const SortIcon = isActive ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <div role="columnheader" aria-label={column.label} aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"} className="min-w-0">
      <Link
        href={href}
        prefetch={false}
        data-active={isActive}
        aria-label={`Ordenar por ${column.label} ${nextDirectionLabel}`}
        className="group inline-flex min-h-10 max-w-full items-center gap-1 px-1 text-left text-[0.625rem] font-semibold uppercase tracking-[0.035em] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[active=true]:text-primary"
      >
        <span className="min-w-0 truncate">{column.label}</span>
        <SortIcon aria-hidden="true" className={`size-3 shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground group-focus-visible:text-muted-foreground"}`} />
      </Link>
    </div>
  );
}

function ActiveFilterChip({ label, removeHref, removeLabel }: { label: string; removeHref: string; removeLabel: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-accent pl-3 pr-1 text-[0.8125rem] font-medium text-accent-foreground">
      {label}
      <Link href={removeHref} aria-label={removeLabel} className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground">
        <X aria-hidden="true" className="size-3.5" />
      </Link>
    </span>
  );
}

export default async function PublicServersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; mode?: string; version?: string; country?: string; access?: string; edition?: string; status?: string; sort?: string; tableSort?: string; tableDirection?: string }> }) {
  await connection();
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const hasQuery = Boolean(query.q?.trim());
  const mode = parseGameModeParam(query.mode);
  const version = parseVersionParam(query.version);
  const country = parseCountryParam(query.country);
  const access = parseCatalogAccessParam(query.access);
  const edition = query.edition === "java" || query.edition === "bedrock" ? query.edition : undefined;
  const status = query.status === "online" || query.status === "offline" || query.status === "unknown" ? query.status : undefined;
  const sort: PublicServerSort = query.sort === "players" || query.sort === "recent" ? query.sort : "rating";
  const hasExplicitSort = query.sort === "rating" || query.sort === "players" || query.sort === "recent";
  const tableSort = isPublicServerTableSort(query.tableSort) ? query.tableSort : undefined;
  const tableDirection: PublicServerSortDirection = query.tableDirection === "desc" ? "desc" : "asc";
  const presetTableSort = (sort === "rating" || sort === "players") && (!hasQuery || hasExplicitSort) ? sort : undefined;
  const activeTableSort = tableSort ?? presetTableSort;
  const activeTableDirection: PublicServerSortDirection = tableSort ? tableDirection : "desc";
  const listArgs = { page: Number.isFinite(requestedPage) ? requestedPage : 1, query: query.q ?? "", mode, version, country, access, edition, status, sort, tableSort: activeTableSort, tableDirection: activeTableDirection } as const;
  const monitorDependent = isMonitorApiConfigured() && isMonitorDependentCatalogQuery({ status, sort, tableSort: activeTableSort });
  const monitorResult = monitorDependent
    ? await getCachedMonitorCatalogPage(listArgs).catch((error) => {
      console.error("[monitor] catalog query unavailable", error instanceof Error ? error.name : "unknown");
      return null;
    })
    : null;
  const monitorUnavailable = monitorDependent && monitorResult === null;
  const result = monitorResult ?? (monitorDependent ? { servers: [], hasNextPage: false, totalCount: 0, page: listArgs.page ?? 1 } : await getCachedPublishedServerPage(listArgs));
  let servers = result.servers;
  if (isMonitorApiConfigured() && !monitorDependent) {
    try {
      const states = await getCachedMonitorStatuses(servers.map((server) => server.id)) ?? [];
      const statesById = new Map(states.map((state) => [state.serverId, state]));
      servers = servers.map((server) => monitorFromApi(server, statesById.get(server.id) ?? null));
    } catch (error) {
      console.error("[monitor] catalog status cache unavailable", error instanceof Error ? error.name : "unknown");
      servers = servers.map((server) => monitorFromApi(server, null));
    }
  }
  const { hasNextPage, page, totalCount } = result;
  const baseParams = new URLSearchParams();
  if (query.q) baseParams.set("q", query.q);
  if (mode) baseParams.set("mode", mode);
  if (version) baseParams.set("version", version);
  if (country) baseParams.set("country", country);
  if (access) baseParams.set("access", access);
  if (query.edition) baseParams.set("edition", query.edition);
  if (query.status) baseParams.set("status", query.status);
  if (query.sort) baseParams.set("sort", query.sort);
  if (tableSort) {
    baseParams.delete("sort");
    baseParams.set("tableSort", tableSort);
    baseParams.set("tableDirection", tableDirection);
  }
  const hrefWith = (overrides: Record<string, string | undefined>, { keepPage = false } = {}) => {
    const next = new URLSearchParams(baseParams);
    if (!keepPage) next.delete("page");
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    return buildCatalogHref(Object.fromEntries(next.entries()));
  };
  const pageHref = (nextPage: number) => hrefWith({ page: String(nextPage) }, { keepPage: true });
  const tableSortHref = (nextSort: PublicServerTableSort) =>
    hrefWith({ sort: undefined, tableSort: nextSort, tableDirection: activeTableSort === nextSort && activeTableDirection === "asc" ? "desc" : "asc" });
  const activeFilterCount = [hasQuery, Boolean(mode), Boolean(version), Boolean(country), Boolean(access), Boolean(edition), Boolean(status)].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || Boolean(query.sort && query.sort !== "rating") || Boolean(tableSort);
  // Offered even when a filter is active: the list is cheap, cached, and a facet the visitor is
  // already inside should not reorder itself under them.
  const versionOptions = await getCachedCatalogVersions().catch(() => [] as string[]);
  const serverResultsSummary = getServerResultsSummary({ page, pageSize: PUBLIC_SERVER_PAGE_SIZE, visibleCount: servers.length, totalCount });
  const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_SERVER_PAGE_SIZE));
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
        <section aria-labelledby="servers-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 id="servers-heading" className="max-w-[40rem] text-3xl font-bold tracking-tight sm:text-[2rem]">Encuentra tu próximo servidor de Minecraft</h1>
              <p className="mt-2.5 max-w-[35rem] text-sm leading-6 text-muted-foreground">Explora, compara y únete a las comunidades publicadas en OpinaCraft.</p>
            </div>
            <Button variant="outline" asChild size="lg" className="shrink-0 bg-card"><Link href="/servers/new"><Plus className="size-4" /> Publicar servidor</Link></Button>
          </div>

          <PromotedServersSection className="mt-7" />

          <section aria-labelledby="server-results-heading" className="mt-7">
            <h2 id="server-results-heading" className="text-lg font-semibold tracking-tight">Todos los servidores</h2>

            <form action={catalogPath} method="get" className="mt-3">
              {tableSort ? <><input type="hidden" name="tableSort" value={tableSort} /><input type="hidden" name="tableDirection" value={tableDirection} /></> : null}
              {!tableSort && hasExplicitSort ? <input type="hidden" name="sort" value={sort} /> : null}
              {status ? <input type="hidden" name="status" value={status} /> : null}

              <CatalogFilterBar
                defaultQuery={query.q ?? ""}
                mode={mode}
                version={version}
                country={country}
                access={access}
                edition={edition}
                versionOptions={versionOptions}
                clearHref={hasActiveFilters ? catalogPath : undefined}
              />

            {activeFilterCount > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Filtros activos</span>
                {hasQuery ? <ActiveFilterChip label={`Búsqueda: ${query.q?.trim()}`} removeHref={hrefWith({ q: undefined })} removeLabel="Quitar la búsqueda" /> : null}
                {mode ? <ActiveFilterChip label={`Modo: ${gameModeLabel(mode)}`} removeHref={hrefWith({ mode: undefined })} removeLabel="Quitar el filtro de modo" /> : null}
                {version ? <ActiveFilterChip label={`Versión: ${version}`} removeHref={hrefWith({ version: undefined })} removeLabel="Quitar el filtro de versión" /> : null}
                {country ? <ActiveFilterChip label={`País: ${serverCountryLabel(country)}`} removeHref={hrefWith({ country: undefined })} removeLabel="Quitar el filtro de país" /> : null}
                {access ? <ActiveFilterChip label={`Acceso: ${catalogAccessOptions.find((option) => option.value === access)?.label ?? access}`} removeHref={hrefWith({ access: undefined })} removeLabel="Quitar el filtro de acceso" /> : null}
                {edition ? <ActiveFilterChip label={`Edición: ${edition === "java" ? "Java" : "Bedrock"}`} removeHref={hrefWith({ edition: undefined })} removeLabel="Quitar el filtro de edición" /> : null}
                {status ? <ActiveFilterChip label={`Estado: ${catalogStatusOptions.find((option) => option.value === status)?.label ?? status}`} removeHref={hrefWith({ status: undefined })} removeLabel="Quitar el filtro de estado" /> : null}
              </div>
            ) : null}

              <div className="mt-4 min-w-0">
                {monitorUnavailable ? (
                  <Alert className="border-warning/40 bg-warning/10">
                    <AlertDescription>No se pudo consultar el estado del monitor para aplicar estos filtros. Inténtalo de nuevo en unos instantes.</AlertDescription>
                  </Alert>
                ) : servers.length === 0 ? (
                  <Empty className="rounded-xl border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><Search /></EmptyMedia>
                      <EmptyTitle>{hasActiveFilters ? "Ningún servidor coincide con estos filtros" : "Todavía no hay servidores publicados"}</EmptyTitle>
                      <EmptyDescription>{hasActiveFilters ? "Prueba a quitar el modo o la versión, o busca solo por nombre." : "Sé el primero en publicar una comunidad de Minecraft en OpinaCraft."}</EmptyDescription>
                    </EmptyHeader>
                    {hasActiveFilters ? <Button variant="outline" asChild><Link href={catalogPath}>Ver todos los servidores</Link></Button> : <Button asChild><Link href="/servers/new">Publicar servidor</Link></Button>}
                  </Empty>
                ) : (
                  <>
                    <Card className="gap-0 overflow-hidden border-0 bg-transparent py-0 shadow-none ring-0 lg:bg-card lg:ring-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 py-3">
                        <p className="text-sm tabular-nums text-muted-foreground">
                          Mostrando <strong className="font-semibold text-foreground">{serverResultsSummary.rangeLabel}</strong> de <strong className="font-semibold text-foreground">{serverResultsSummary.totalCount}</strong> {serverResultsSummary.serverLabel}
                        </p>
                        <span className="text-xs text-muted-foreground">{orderSummary(activeTableSort, activeTableDirection, sort, hasQuery)}</span>
                      </div>
                      <CardContent className="flex flex-col gap-2 p-0 lg:block">
                        <div role="row" aria-label="Ordenar resultados" className={`hidden h-10 items-center border-y bg-muted/50 px-4 text-muted-foreground lg:grid ${tableGridTemplate} lg:items-center lg:gap-3`}>
                          {tableColumns.map((column) => <SortableColumnHeader key={column.key} column={column} activeSort={activeTableSort} direction={activeTableDirection} href={tableSortHref(column.key)} />)}
                        </div>
                        {servers.map((server) => <PublicServerRow key={server.id} server={server} />)}
                      </CardContent>
                    </Card>
                    <nav className="mt-5 flex items-center justify-between gap-4" aria-label="Páginas de servidores">
                      {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}>Anterior</Link></Button> : <span />}
                      <span className="text-xs tabular-nums text-muted-foreground">Página {page} de {totalPages}</span>
                      {hasNextPage ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>Siguiente</Link></Button> : <span />}
                    </nav>
                  </>
                )}
              </div>
            </form>
          </section>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
