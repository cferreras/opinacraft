import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FilterSelect } from "@/components/filter-select";
import { PublicServerRow } from "@/components/public-server-row";
import { ServerSearchInput } from "@/components/server-search-input";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TagCombobox } from "@/components/tag-combobox";
import { listPublishedServers, type PublicServerSort } from "@/lib/servers/queries";
import { normalizeTagSlug } from "@/lib/servers/tags";

export const metadata: Metadata = { title: "Servidores Minecraft | OpinaCraft", description: "Descubre comunidades Minecraft en OpinaCraft.", alternates: { canonical: "/servers" }, openGraph: { title: "Servidores Minecraft | OpinaCraft", description: "Descubre comunidades Minecraft en OpinaCraft.", type: "website" } };
export const dynamic = "force-dynamic";

const sortOptions: Array<{ value: PublicServerSort; label: string }> = [
  { value: "rating", label: "Mejor valorados" },
  { value: "players", label: "Más jugadores" },
  { value: "recent", label: "Más recientes" },
];

function countLabel(count: number) { return `${count} ${count === 1 ? "servidor" : "servidores"}`; }

export default async function PublicServersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; tags?: string; edition?: string; status?: string; sort?: string }> }) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const edition = query.edition === "java" || query.edition === "bedrock" ? query.edition : undefined;
  const status = query.status === "online" || query.status === "offline" || query.status === "unknown" ? query.status : undefined;
  const sort: PublicServerSort = query.sort === "players" || query.sort === "recent" ? query.sort : "rating";
  const tagSlugs = (query.tags ?? "").split(",").map((tag) => normalizeTagSlug(tag)).filter(Boolean);
  const { servers, hasNextPage, page } = await listPublishedServers({ page: Number.isFinite(requestedPage) ? requestedPage : 1, query: query.q ?? "", tagSlugs, edition, status, sort });
  const searchParamsForPage = new URLSearchParams();
  if (query.q) searchParamsForPage.set("q", query.q);
  if (query.tags) searchParamsForPage.set("tags", query.tags);
  if (query.edition) searchParamsForPage.set("edition", query.edition);
  if (query.status) searchParamsForPage.set("status", query.status);
  if (query.sort) searchParamsForPage.set("sort", query.sort);
  const pageHref = (nextPage: number) => { searchParamsForPage.set("page", String(nextPage)); return `/servers?${searchParamsForPage.toString()}`; };
  const initialTags = (query.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const hasActiveFilters = Boolean(query.q || query.tags || query.edition || query.status || (query.sort && query.sort !== "rating"));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <section aria-labelledby="servers-heading"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Directorio comunitario</p><h1 id="servers-heading" className="mt-2 text-4xl font-semibold tracking-tight">Encuentra tu próximo servidor de Minecraft</h1><p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">Explora, compara y únete a las mejores comunidades de Minecraft.</p>
          <form action="/servers" method="get" className="mt-6"><Card className="overflow-visible"><CardContent className="p-4"><div className="relative min-w-0"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><label htmlFor="server-search" className="sr-only">Buscar</label><ServerSearchInput defaultValue={query.q ?? ""} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.05fr_1.2fr_1.35fr_1.16fr]"><FilterSelect id="edition-filter" name="edition" label="Edición" defaultValue={query.edition ?? ""} submitOnChange><option value="">Todas</option><option value="java">Java</option><option value="bedrock">Bedrock</option></FilterSelect><FilterSelect id="status-filter" name="status" label="Estado" defaultValue={query.status ?? ""} submitOnChange><option value="">Todos</option><option value="online">En línea</option><option value="offline">Fuera de línea</option><option value="unknown">Desconocido</option></FilterSelect><TagCombobox name="tags" initialTags={initialTags} compact label="Etiquetas" submitOnChange resetPagination /><FilterSelect id="sort-filter" name="sort" label="Ordenar" defaultValue={sort} submitOnChange>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</FilterSelect></div><div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span>Mostrando {countLabel(servers.length)} en esta página</span>{hasActiveFilters ? <Button variant="link" asChild size="sm" className="h-auto p-0"><Link href="/servers">Limpiar filtros</Link></Button> : null}</div></CardContent></Card><Button type="submit" variant="ghost" className="sr-only">Aplicar filtros</Button></form>
        </section>
        {servers.length === 0 ? <Empty className="mt-4 rounded-xl border"><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>Todavía no hay servidores publicados</EmptyTitle><EmptyDescription>Sé el primero en publicar una comunidad Minecraft en OpinaCraft.</EmptyDescription></EmptyHeader><Button asChild><Link href="/servers/new">Añadir servidor</Link></Button></Empty> : <section className="mt-4" aria-labelledby="server-results-heading"><h2 id="server-results-heading" className="sr-only">Resultados de servidores</h2><Card className="overflow-hidden gap-0 py-0"><CardHeader className="border-b bg-muted/30 px-4 py-3"><CardTitle className="text-sm">Resultados</CardTitle></CardHeader><CardContent className="p-0"><div className="hidden h-10 items-center border-b bg-muted/20 px-4 text-[0.625rem] font-medium uppercase tracking-[0.035em] text-muted-foreground xl:grid xl:grid-cols-[minmax(15.625rem,1.5fr)_5.25rem_6.125rem_5.125rem_3.625rem_4.5rem_1.75rem] xl:items-center xl:gap-2"><span>Servidor</span><span>Edición</span><span>Jugadores</span><span>Versión</span><span>Latencia</span><span>Valoración</span><span>IP</span></div>{servers.map((server) => <PublicServerRow key={server.id} server={server} />)}</CardContent></Card><nav className="mt-5 flex items-center justify-between" aria-label="Páginas de servidores">{page > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page - 1)}>Anterior</Link></Button> : <span />}{hasNextPage ? <Button asChild variant="outline" size="sm"><Link href={pageHref(page + 1)}>Siguiente</Link></Button> : null}</nav></section>}
      </main>
      <SiteFooter />
    </div>
  );
}
