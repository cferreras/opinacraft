import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FilterSelect } from "@/components/filter-select";
import { PublicServerRow } from "@/components/public-server-row";
import { ServerSearchInput } from "@/components/server-search-input";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TagCombobox } from "@/components/tag-combobox";
import { getCachedMonitorCatalogPage, getCachedMonitorStatuses, getCachedPublishedServerPage } from "@/lib/servers/cached-queries";
import { isMonitorApiConfigured } from "@/lib/servers/monitor-api-client";
import {
  isMonitorDependentCatalogQuery,
  isPublicServerTableSort,
  monitorFromApi,
  type PublicServerSort,
  type PublicServerSortDirection,
  type PublicServerTableSort,
} from "@/lib/servers/queries";
import { normalizeTagSlug } from "@/lib/servers/tags";

export const metadata: Metadata = { title: "Servidores Minecraft | OpinaCraft", description: "Descubre comunidades Minecraft en OpinaCraft.", alternates: { canonical: "/servers" }, openGraph: { title: "Servidores Minecraft | OpinaCraft", description: "Descubre comunidades Minecraft en OpinaCraft.", type: "website" } };
export const tableGridTemplate = "lg:grid-cols-[minmax(0,1fr)_5rem_5.75rem_4.75rem_4rem_6rem_9.5rem]";

const sortOptions: Array<{ value: PublicServerSort; label: string }> = [
  { value: "rating", label: "Mejor valorados" },
  { value: "players", label: "Más jugadores" },
  { value: "recent", label: "Más recientes" },
];

const tableColumns: Array<{ key: PublicServerTableSort; label: string }> = [
  { key: "name", label: "Servidor" },
  { key: "edition", label: "Edición" },
  { key: "players", label: "Jugadores" },
  { key: "version", label: "Versión" },
  { key: "latency", label: "Ping" },
  { key: "rating", label: "Valoración" },
  { key: "ip", label: "Dirección" },
];

function tableSortLabel(sort: PublicServerTableSort, direction: PublicServerSortDirection) {
  const column = tableColumns.find((item) => item.key === sort);
  return `${column?.label ?? "Tabla"} · ${direction === "asc" ? "ascendente" : "descendente"}`;
}

function orderSummary(activeSort: PublicServerTableSort | undefined, direction: PublicServerSortDirection, fallback: PublicServerSort, hasQuery: boolean) {
  if (hasQuery && !activeSort) return "Ordenado por relevancia";
  if (!activeSort) return `Ordenado por ${sortOptions.find((option) => option.value === fallback)?.label.toLowerCase() ?? "valoración"}`;
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

function countLabel(count: number) { return `${count} ${count === 1 ? "servidor" : "servidores"}`; }

export default async function PublicServersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; tags?: string; edition?: string; status?: string; sort?: string; tableSort?: string; tableDirection?: string }> }) {
  await connection();
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const hasQuery = Boolean(query.q?.trim());
  const edition = query.edition === "java" || query.edition === "bedrock" ? query.edition : undefined;
  const status = query.status === "online" || query.status === "offline" || query.status === "unknown" ? query.status : undefined;
  const sort: PublicServerSort = query.sort === "players" || query.sort === "recent" ? query.sort : "rating";
  const hasExplicitSort = query.sort === "rating" || query.sort === "players" || query.sort === "recent";
  const tableSort = isPublicServerTableSort(query.tableSort) ? query.tableSort : undefined;
  const tableDirection: PublicServerSortDirection = query.tableDirection === "desc" ? "desc" : "asc";
  const presetTableSort = (sort === "rating" || sort === "players") && (!hasQuery || hasExplicitSort) ? sort : undefined;
  const activeTableSort = tableSort ?? presetTableSort;
  const activeTableDirection: PublicServerSortDirection = tableSort ? tableDirection : "desc";
  const tagSlugs = (query.tags ?? "").split(",").map((tag) => normalizeTagSlug(tag)).filter(Boolean);
  const listArgs = { page: Number.isFinite(requestedPage) ? requestedPage : 1, query: query.q ?? "", tagSlugs, edition, status, sort, tableSort: activeTableSort, tableDirection: activeTableDirection } as const;
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
  const { hasNextPage, page } = result;
  const searchParamsForPage = new URLSearchParams();
  if (query.q) searchParamsForPage.set("q", query.q);
  if (query.tags) searchParamsForPage.set("tags", query.tags);
  if (query.edition) searchParamsForPage.set("edition", query.edition);
  if (query.status) searchParamsForPage.set("status", query.status);
  if (query.sort) searchParamsForPage.set("sort", query.sort);
  if (tableSort) {
    searchParamsForPage.delete("sort");
    searchParamsForPage.set("tableSort", tableSort);
    searchParamsForPage.set("tableDirection", tableDirection);
  }
  const pageHref = (nextPage: number) => { searchParamsForPage.set("page", String(nextPage)); return `/servers?${searchParamsForPage.toString()}`; };
  const tableSortHref = (nextSort: PublicServerTableSort) => {
    const nextSearchParams = new URLSearchParams(searchParamsForPage);
    nextSearchParams.delete("page");
    nextSearchParams.delete("sort");
    nextSearchParams.set("tableSort", nextSort);
    nextSearchParams.set("tableDirection", activeTableSort === nextSort && activeTableDirection === "asc" ? "desc" : "asc");
    return `/servers?${nextSearchParams.toString()}`;
  };
  const initialTags = (query.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const hasActiveFilters = Boolean(hasQuery || query.tags || query.edition || query.status || (query.sort && query.sort !== "rating") || tableSort);

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
            <Button variant="outline" asChild size="lg" className="shrink-0"><Link href="/servers/new"><Plus className="size-4" /> Publicar servidor</Link></Button>
          </div>

          <form action="/servers" method="get" className="mt-6">
            <Card className="overflow-visible">
              <CardContent>
                <div className="relative min-w-0">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <label htmlFor="server-search" className="sr-only">Buscar</label>
                  <ServerSearchInput defaultValue={query.q ?? ""} />
                </div>
                {tableSort ? <><input type="hidden" name="tableSort" value={tableSort} /><input type="hidden" name="tableDirection" value={tableDirection} /></> : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.05fr_1.2fr_1.35fr_1.16fr]">
                  <FilterSelect id="edition-filter" name="edition" label="Edición" defaultValue={query.edition ?? ""} submitOnChange><option value="">Todas</option><option value="java">Java</option><option value="bedrock">Bedrock</option></FilterSelect>
                  <FilterSelect id="status-filter" name="status" label="Estado" defaultValue={query.status ?? ""} submitOnChange><option value="">Todos</option><option value="online">En línea</option><option value="offline">Fuera de línea</option><option value="unknown">Desconocido</option></FilterSelect>
                  <TagCombobox name="tags" initialTags={initialTags} compact label="Etiquetas" submitOnChange resetPagination />
                  <FilterSelect id="sort-filter" name="sort" label="Ordenar" defaultValue={tableSort ? "table" : sort} submitOnChange clearFieldsOnChange={tableSort ? ["tableSort", "tableDirection"] : undefined}>{tableSort ? <option value="table" disabled>{tableSortLabel(tableSort, tableDirection)}</option> : null}{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</FilterSelect>
                </div>
              </CardContent>
            </Card>
            <Button type="submit" variant="ghost" className="sr-only">Aplicar filtros</Button>
          </form>
        </section>

        {monitorUnavailable ? (
          <Alert className="mt-4 border-warning/40 bg-warning/10">
            <AlertDescription>No se pudo consultar el estado del monitor para aplicar estos filtros. Inténtalo de nuevo en unos instantes.</AlertDescription>
          </Alert>
        ) : servers.length === 0 ? (
          <Empty className="mt-4 rounded-xl border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Search /></EmptyMedia>
              <EmptyTitle>{hasActiveFilters ? "Ningún servidor coincide con estos filtros" : "Todavía no hay servidores publicados"}</EmptyTitle>
              <EmptyDescription>{hasActiveFilters ? "Prueba a quitar la edición o el estado, o busca solo por nombre." : "Sé el primero en publicar una comunidad Minecraft en OpinaCraft."}</EmptyDescription>
            </EmptyHeader>
            {hasActiveFilters ? <Button variant="outline" asChild><Link href="/servers">Limpiar filtros</Link></Button> : <Button asChild><Link href="/servers/new">Añadir servidor</Link></Button>}
          </Empty>
        ) : (
          <section className="mt-4" aria-labelledby="server-results-heading">
            <h2 id="server-results-heading" className="sr-only">Resultados de servidores</h2>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 py-3">
                <p className="text-sm text-muted-foreground"><strong className="font-bold tabular-nums text-foreground">{countLabel(servers.length)}</strong> en esta página</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{orderSummary(activeTableSort, activeTableDirection, sort, hasQuery)}</span>
                  {hasActiveFilters ? <Button variant="link" asChild size="sm" className="h-auto p-0 text-xs font-semibold"><Link href="/servers">Limpiar filtros</Link></Button> : null}
                </div>
              </div>
              <CardContent className="p-0">
                <div role="row" aria-label="Ordenar resultados" className={`hidden h-10 items-center border-y bg-muted/30 px-4 text-muted-foreground lg:grid ${tableGridTemplate} lg:items-center lg:gap-3`}>
                  {tableColumns.map((column) => <SortableColumnHeader key={column.key} column={column} activeSort={activeTableSort} direction={activeTableDirection} href={tableSortHref(column.key)} />)}
                </div>
                {servers.map((server) => <PublicServerRow key={server.id} server={server} />)}
              </CardContent>
            </Card>
            <nav className="mt-5 flex items-center justify-between gap-4" aria-label="Páginas de servidores">
              {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}>Anterior</Link></Button> : <span />}
              <span className="text-xs tabular-nums text-muted-foreground">Página {page}</span>
              {hasNextPage ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>Siguiente</Link></Button> : <span />}
            </nav>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
