import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { AiRankingNotice } from "@/components/ai-ranking-notice";
import { BlogHighlightsCard } from "@/components/blog-highlights-card";
import { CatalogFilterBar } from "@/components/catalog-filter-bar";
import { PublicServerRow } from "@/components/public-server-row";
import { SiteHeader } from "@/components/site-header";
import { JsonLd } from "@/components/json-ld";
import { clientEnv } from "@/env/client";
import { isAiSearchConfigured } from "@/lib/search/runtime";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { itemListSchema } from "@/lib/seo/structured-data";
import { getCachedCatalogVersions, getCachedMonitorCatalogPage, getCachedMonitorStatuses, getCachedPublishedServerPage } from "@/lib/servers/cached-queries";
import { isMonitorApiConfigured } from "@/lib/servers/monitor-api-client";
import { listPublishedServersByRankedIds } from "@/lib/servers/queries";
import { runSemanticSearch } from "@/lib/search/semantic-runtime";
import { sessionIdFromToken } from "@/lib/search/runtime";
import { SEARCH_SESSION_COOKIE } from "@/lib/search/session";
import { requestIp } from "@/lib/search/request-ip";
import { cookies, headers } from "next/headers";
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
import { buildCatalogHref, catalogInputFrom, catalogPath } from "@/lib/servers/catalog-route";
import { accessParamValues, catalogAccessOptions, catalogSortOptions, catalogStatusOptions, matchedAccessIntent, parseCatalogAccessParams, parseCatalogEditionParam } from "@/lib/servers/catalog-filters";
import { gameModeLabel, parseGameModeParams } from "@/lib/servers/game-modes";
import { countryParamValues, parseCountryParams, serverCountriesLabel } from "@/lib/servers/countries";
import { parseVersionParam } from "@/lib/servers/minecraft-version";

export const catalogTitle = "Directorio de servidores de Minecraft en español | OpinaCraft";
export const catalogDescription = "Descubre, compara y únete a comunidades de Minecraft: estado en tiempo real, ping, modalidad y opiniones de quienes ya juegan en ellas.";

export const metadata: Metadata = { title: catalogTitle, description: catalogDescription, alternates: { canonical: catalogPath }, openGraph: buildOpenGraph({ title: catalogTitle, description: catalogDescription, path: catalogPath }) };
/**
 * The rail leaves the table ~700px at `lg` and its designed 828px only past ~1120px, which is where
 * the edition column fits without squeezing the server name to nothing — so it waits for the room.
 */
export const tableGridTemplate = "lg:grid-cols-[minmax(0,1fr)_9rem_5.5rem_3.25rem_5.75rem_1rem] wide:grid-cols-[minmax(0,1fr)_5.375rem_9rem_5.5rem_3.25rem_5.75rem_1rem]";

const tableColumns: Array<{ key: PublicServerTableSort; label: string; align?: "end" }> = [
  { key: "name", label: "Servidor" },
  { key: "players", label: "Jugadores", align: "end" },
  { key: "latency", label: "Ping", align: "end" },
  { key: "rating", label: "Valoración", align: "end" },
];

/**
 * The header mirrors the row column for column. Edition and address are read, never ordered by, so
 * they label themselves instead of pretending to be sortable; the last column holds the row chevron.
 */
type TableHeaderCell = { kind: "sort"; key: PublicServerTableSort } | { kind: "static"; label: string; className?: string } | { kind: "spacer" };

const tableHeaderCells: TableHeaderCell[] = [
  { kind: "sort", key: "name" },
  { kind: "static", label: "Edición", className: "hidden wide:block" },
  { kind: "static", label: "Dirección" },
  { kind: "sort", key: "players" },
  { kind: "sort", key: "latency" },
  { kind: "sort", key: "rating" },
  { kind: "spacer" },
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
    <div role="columnheader" aria-label={column.label} aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"} className={`flex min-w-0 ${column.align === "end" ? "justify-end" : ""}`}>
      <Link
        href={href}
        prefetch={false}
        data-active={isActive}
        aria-label={`Ordenar por ${column.label} ${nextDirectionLabel}`}
        className={`group inline-flex min-h-10 max-w-full items-center gap-1 px-1 text-left text-[0.625rem] font-semibold uppercase tracking-[0.035em] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[active=true]:text-primary ${column.align === "end" ? "-mr-1" : "-ml-1"}`}
      >
        <span className="min-w-0 truncate">{column.label}</span>
        <SortIcon aria-hidden="true" className={`size-3 shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground group-focus-visible:text-muted-foreground"}`} />
      </Link>
    </div>
  );
}

function StaticColumnHeader({ label, className = "" }: { label: string; className?: string }) {
  return <div role="columnheader" className={`min-w-0 truncate px-1 text-[0.625rem] font-semibold uppercase tracking-[0.035em] text-muted-foreground ${className}`}>{label}</div>;
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

/**
 * "no premium" is one request the catalog stores as two values, so the chip says the request rather
 * than listing the storage. Anything else falls back to the filter bar's own labels.
 */
function accessChipLabel(values: readonly string[]) {
  const intent = matchedAccessIntent(values);
  if (intent) return intent.label;
  return values.map((value) => catalogAccessOptions.find((option) => option.value === value)?.label ?? value).join(", ");
}

export default async function PublicServersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; relevancia?: string; mode?: string | string[]; version?: string; country?: string | string[]; access?: string | string[]; edition?: string; status?: string; sort?: string; tableSort?: string; tableDirection?: string }> }) {
  await connection();
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const hasQuery = Boolean(query.q?.trim());
  const modes = parseGameModeParams(query.mode);
  const version = parseVersionParam(query.version);
  const countries = parseCountryParams(query.country);
  const access = parseCatalogAccessParams(query.access);
  const edition = parseCatalogEditionParam(query.edition);
  // What goes back into the URL and the form: one group code where the selection is exactly a
  // group, so a region survives a version change without writing itself out eighteen times.
  const countryParams = countryParamValues(countries);
  const accessParams = accessParamValues(access);
  const status = query.status === "online" || query.status === "offline" || query.status === "unknown" ? query.status : undefined;
  const sort: PublicServerSort = query.sort === "players" || query.sort === "recent" ? query.sort : "rating";
  const hasExplicitSort = query.sort === "rating" || query.sort === "players" || query.sort === "recent";
  const tableSort = isPublicServerTableSort(query.tableSort) ? query.tableSort : undefined;
  const tableDirection: PublicServerSortDirection = query.tableDirection === "desc" ? "desc" : "asc";
  const presetTableSort = (sort === "rating" || sort === "players") && (!hasQuery || hasExplicitSort) ? sort : undefined;
  const activeTableSort = tableSort ?? presetTableSort;
  const activeTableDirection: PublicServerSortDirection = tableSort ? tableDirection : "desc";
  const safePage = Number.isFinite(requestedPage) ? requestedPage : 1;

  /**
   * With `?relevancia=ia`, `q` is not text to match: it is the description each server is judged
   * against, so the keyword condition must not also run. Filtering by a phrase nobody wrote into a
   * name and ranking by how well each server answers it would intersect two different questions and
   * return nothing — the same trap the facet pipeline avoids by making filters and keywords
   * exclusive.
   */
  const judgeBy = query.relevancia === "ia" ? (query.q ?? "").trim() : "";
  const semantic = judgeBy ? await runSemanticSearch(judgeBy, { modes, countries, access, ...(edition ? { edition } : {}) }, {
    sessionId: sessionIdFromToken((await cookies()).get(SEARCH_SESSION_COOKIE)?.value),
    ip: requestIp(await headers()),
  }) : null;
  const ranked = semantic?.ran ? semantic.ranking : null;

  const listArgs = {
    page: safePage,
    // Judged queries keep their text out of the SQL for the reason above.
    query: ranked ? "" : query.q ?? "",
    mode: modes, version, country: countries, access, edition, status, sort,
    tableSort: activeTableSort, tableDirection: activeTableDirection,
  } as const;
  const monitorDependent = !ranked && isMonitorApiConfigured() && isMonitorDependentCatalogQuery({ status, version, sort, tableSort: activeTableSort });
  const monitorResult = monitorDependent
    ? await getCachedMonitorCatalogPage(listArgs).catch((error) => {
      console.error("[monitor] catalog query unavailable", error instanceof Error ? error.name : "unknown");
      return null;
    })
    : null;
  const monitorUnavailable = monitorDependent && monitorResult === null;
  const result = ranked
    // The ranking is the order; Postgres only fills in what each server is.
    ? await listPublishedServersByRankedIds({ ids: ranked.scores.map((entry) => entry.serverId), page: safePage, edition })
    : monitorResult ?? (monitorDependent ? { servers: [], hasNextPage: false, totalCount: 0, page: listArgs.page ?? 1 } : await getCachedPublishedServerPage(listArgs));
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
  if (ranked) baseParams.set("relevancia", "ia");
  for (const slug of modes) baseParams.append("mode", slug);
  if (version) baseParams.set("version", version);
  for (const value of countryParams) baseParams.append("country", value);
  for (const value of accessParams) baseParams.append("access", value);
  if (edition) baseParams.set("edition", edition);
  if (query.status) baseParams.set("status", query.status);
  if (query.sort) baseParams.set("sort", query.sort);
  if (tableSort) {
    baseParams.delete("sort");
    baseParams.set("tableSort", tableSort);
    baseParams.set("tableDirection", tableDirection);
  }
  const hrefWith = (overrides: Record<string, string | readonly string[] | undefined>, { keepPage = false } = {}) => {
    const next = new URLSearchParams(baseParams);
    if (!keepPage) next.delete("page");
    for (const [key, value] of Object.entries(overrides)) {
      next.delete(key);
      if (value === undefined || value === "") continue;
      for (const item of Array.isArray(value) ? value : [value as string]) if (item) next.append(key, item);
    }
    return buildCatalogHref(catalogInputFrom(next));
  };
  const pageHref = (nextPage: number) => hrefWith({ page: String(nextPage) }, { keepPage: true });
  // Ordering by a column means leaving the judged order: clearing `relevancia` here is what makes the
  // column headers tell the truth, since a ranked page ignores `tableSort` entirely.
  const tableSortHref = (nextSort: PublicServerTableSort) =>
    hrefWith({ sort: undefined, relevancia: undefined, tableSort: nextSort, tableDirection: activeTableSort === nextSort && activeTableDirection === "asc" ? "desc" : "asc" });
  // A region counts as the one filter the visitor asked for, not as eighteen.
  const activeFilterCount = [hasQuery, modes.length > 0, Boolean(version), countries.length > 0, access.length > 0, Boolean(edition), Boolean(status)].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || Boolean(query.sort && query.sort !== "rating") || Boolean(tableSort);
  // Offered even when a filter is active: the list is cheap, cached, and a facet the visitor is
  // already inside should not reorder itself under them.
  const versionOptions = await getCachedCatalogVersions().catch(() => [] as string[]);
  // Both halves have to be configured: the widget needs its public key, and the route behind it
  // needs the API key, the Turnstile secret and the session secret.
  const turnstileSiteKey = isAiSearchConfigured() ? clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY : undefined;
  const serverResultsSummary = getServerResultsSummary({ page, pageSize: PUBLIC_SERVER_PAGE_SIZE, visibleCount: servers.length, totalCount });
  const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_SERVER_PAGE_SIZE));
  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      {/* The listing as the ordered list it is. Only the servers actually rendered on this page go
          in, in the order they are rendered. */}
      {servers.length > 0 ? <JsonLd data={itemListSchema(servers.map((server) => ({ name: server.name, path: `/servers/${server.slug}` })))} /> : null}
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
        <section aria-labelledby="servers-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 id="servers-heading" className="max-w-[40rem] text-3xl font-bold tracking-tight sm:text-[2rem]">Encuentra tu próximo servidor de Minecraft</h1>
              <p className="mt-2.5 max-w-[35rem] text-sm leading-6 text-muted-foreground">Explora, compara y únete a las comunidades publicadas en OpinaCraft.</p>
            </div>
            <Button variant="outline" asChild size="lg" className="shrink-0 bg-card"><Link href="/servers/new"><Plus className="size-4" /> Publicar servidor</Link></Button>
          </div>

          {/* Content column plus a rail: below `lg` the rail collapses under the results, which is
              where the blog module belongs on mobile. */}
          <div className="mt-7 grid items-start gap-x-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0">
              {/* The promoted-slots placeholder used to sit here, taking a fifth of the first
                  mobile screen to announce a product that does not exist yet. It comes back when
                  it has inventory to show. */}
              <section aria-labelledby="server-results-heading" className="mt-1">
                <h2 id="server-results-heading" className="text-lg font-semibold tracking-tight">Todos los servidores</h2>

                <form action={catalogPath} method="get" className="mt-3">
                  {tableSort ? <><input type="hidden" name="tableSort" value={tableSort} /><input type="hidden" name="tableDirection" value={tableDirection} /></> : null}
                  {!tableSort && hasExplicitSort ? <input type="hidden" name="sort" value={sort} /> : null}
                  {status ? <input type="hidden" name="status" value={status} /> : null}
                  {/* The bar's picker holds one mode, so the rest ride along as hidden inputs:
                      changing the country must not collapse a two-mode filter down to one. The
                      picker still replaces the primary mode, and the chips below remove them one
                      by one. */}
                  {modes.slice(1).map((slug) => <input key={slug} type="hidden" name="mode" value={slug} />)}
                  {countryParams.slice(1).map((value) => <input key={value} type="hidden" name="country" value={value} />)}
                  {accessParams.slice(1).map((value) => <input key={value} type="hidden" name="access" value={value} />)}

                  <CatalogFilterBar
                    query={query.q ?? ""}
                    mode={modes[0]}
                    version={version}
                    country={countryParams[0]}
                    access={accessParams[0]}
                    edition={edition}
                    versionOptions={versionOptions}
                    turnstileSiteKey={turnstileSiteKey}
                    clearHref={hasActiveFilters ? catalogPath : undefined}
                  />

                {ranked && semantic?.ran ? (
                  <AiRankingNotice
                    judged={semantic.judged}
                    approximate={ranked.approximate}
                    partial={semantic.partial}
                    // Dropping `relevancia` turns the same text back into a keyword search, which is
                    // the honest way out: the visitor keeps their words and loses only the judgement.
                    plainHref={hrefWith({ relevancia: undefined })}
                  />
                ) : null}

                {activeFilterCount > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Filtros activos</span>
                    {hasQuery ? <ActiveFilterChip label={`Búsqueda: ${query.q?.trim()}`} removeHref={hrefWith({ q: undefined })} removeLabel="Quitar la búsqueda" /> : null}
                    {modes.map((slug) => <ActiveFilterChip key={slug} label={`Modo: ${gameModeLabel(slug)}`} removeHref={hrefWith({ mode: modes.filter((item) => item !== slug) })} removeLabel={`Quitar el filtro de modo ${gameModeLabel(slug)}`} />)}
                    {version ? <ActiveFilterChip label={`Versión: ${version}`} removeHref={hrefWith({ version: undefined })} removeLabel="Quitar el filtro de versión" /> : null}
                    {/* One chip per facet, not per value: a selection the visitor named with one
                        word is removed with one click, and its label says the word they used. */}
                    {countries.length > 0 ? <ActiveFilterChip label={`País: ${serverCountriesLabel(countries)}`} removeHref={hrefWith({ country: undefined })} removeLabel="Quitar el filtro de país" /> : null}
                    {access.length > 0 ? <ActiveFilterChip label={`Acceso: ${accessChipLabel(access)}`} removeHref={hrefWith({ access: undefined })} removeLabel="Quitar el filtro de acceso" /> : null}
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
                          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 py-3 lg:px-4.5 lg:py-3.5">
                            <p className="text-sm tabular-nums text-muted-foreground">
                              Mostrando <strong className="font-semibold text-foreground">{serverResultsSummary.rangeLabel}</strong> de <strong className="font-semibold text-foreground">{serverResultsSummary.totalCount}</strong> {serverResultsSummary.serverLabel}
                            </p>
                            <span className="text-xs text-muted-foreground">{orderSummary(activeTableSort, activeTableDirection, sort, hasQuery)}</span>
                          </div>
                          <CardContent className="flex flex-col gap-2 p-0 lg:block">
                            <div role="row" aria-label="Ordenar resultados" className={`hidden h-10 items-center border-y bg-muted/40 px-4.5 text-muted-foreground lg:grid ${tableGridTemplate} lg:items-center lg:gap-3.5`}>
                              {tableHeaderCells.map((cell) => {
                                if (cell.kind === "spacer") return <span key="actions" aria-hidden="true" />;
                                if (cell.kind === "static") return <StaticColumnHeader key={cell.label} label={cell.label} className={cell.className} />;
                                const column = tableColumns.find((item) => item.key === cell.key);
                                return column ? <SortableColumnHeader key={column.key} column={column} activeSort={activeTableSort} direction={activeTableDirection} href={tableSortHref(column.key)} /> : null;
                              })}
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
            </div>

            <aside aria-labelledby="blog-highlights-heading" className="mt-8 min-w-0 lg:mt-0">
              <BlogHighlightsCard />
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
