import type { Metadata } from "next";
import Link from "next/link";
import { IconSearch } from "@tabler/icons-react";

import { FilterSelect } from "@/components/filter-select";
import { PublicServerRow } from "@/components/public-server-row";
import { ServerSearchInput } from "@/components/server-search-input";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TagCombobox } from "@/components/tag-combobox";
import { listPublishedServers, type PublicServerSort } from "@/lib/servers/queries";
import { normalizeTagSlug } from "@/lib/servers/tags";

export const metadata: Metadata = {
  title: "Servidores Minecraft | OpinaCraft",
  description: "Descubre comunidades Minecraft en OpinaCraft.",
  alternates: { canonical: "/servers" },
  openGraph: {
    title: "Servidores Minecraft | OpinaCraft",
    description: "Descubre comunidades Minecraft en OpinaCraft.",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

const sortOptions: Array<{ value: PublicServerSort; label: string }> = [
  { value: "rating", label: "Mejor valorados" },
  { value: "players", label: "Más jugadores" },
  { value: "recent", label: "Más recientes" },
];

function countLabel(count: number) {
  return `${count} ${count === 1 ? "servidor" : "servidores"}`;
}

export default async function PublicServersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tags?: string; edition?: string; status?: string; sort?: string }>;
}) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const edition = query.edition === "java" || query.edition === "bedrock" ? query.edition : undefined;
  const status = query.status === "online" || query.status === "offline" || query.status === "unknown" ? query.status : undefined;
  const sort: PublicServerSort = query.sort === "players" || query.sort === "recent" ? query.sort : "rating";
  const tagSlugs = (query.tags ?? "").split(",").map((tag) => normalizeTagSlug(tag)).filter(Boolean);
  const { servers, hasNextPage, page } = await listPublishedServers({
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
    query: query.q ?? "",
    tagSlugs,
    edition,
    status,
    sort,
  });
  const searchParamsForPage = new URLSearchParams();
  if (query.q) searchParamsForPage.set("q", query.q);
  if (query.tags) searchParamsForPage.set("tags", query.tags);
  if (query.edition) searchParamsForPage.set("edition", query.edition);
  if (query.status) searchParamsForPage.set("status", query.status);
  if (query.sort) searchParamsForPage.set("sort", query.sort);
  const pageHref = (nextPage: number) => {
    searchParamsForPage.set("page", String(nextPage));
    return `/servers?${searchParamsForPage.toString()}`;
  };

  const initialTags = (query.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const hasActiveFilters = Boolean(
    query.q ||
      query.tags ||
      query.edition ||
      query.status ||
      (query.sort && query.sort !== "rating"),
  );

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#17202a]">
      <SiteHeader />

      <main className="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] border-x border-[#edf0f3] bg-white px-4 pb-12 pt-7 sm:px-6 sm:pt-8 lg:px-7">
        <section aria-labelledby="servers-heading">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2d34cf]">Directorio comunitario</p>
          <h1 id="servers-heading" className="mt-2.5 max-w-[680px] text-[34px] font-semibold leading-[1.12] tracking-[-0.055em] text-[#101722] sm:text-[42px]">
            Encuentra tu próximo
            <br className="hidden sm:block" /> servidor de Minecraft
          </h1>
          <p className="mt-2 max-w-[620px] text-[13px] leading-[1.55] text-[#55627b]">
            Explora, compara y únete a las mejores comunidades de Minecraft.
          </p>

          <form action="/servers" method="get" className="mt-4">
            <div className="flex h-[43px] max-w-[765px] items-center rounded-lg border border-[#dce2e7] bg-white shadow-[0_1px_2px_rgba(16,30,45,0.02)] focus-within:border-[#4655e8] focus-within:ring-2 focus-within:ring-[#4655e8]/10">
              <IconSearch aria-hidden="true" className="ml-3.5 shrink-0 text-[#7b8793]" size={17} stroke={1.7} />
              <label htmlFor="server-search" className="sr-only">Buscar</label>
              <ServerSearchInput defaultValue={query.q ?? ""} />
            </div>

            <div className="relative z-30 mt-6 overflow-visible border-y border-[#e0e6eb] bg-[#f7f8fa] px-3 py-3 sm:px-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.05fr_1.2fr_1.35fr_1.16fr] lg:items-center">
                <FilterSelect id="edition-filter" name="edition" label="Edición" defaultValue={query.edition ?? ""} submitOnChange>
                  <option value="">Todas</option>
                  <option value="java">Java</option>
                  <option value="bedrock">Bedrock</option>
                </FilterSelect>
                <FilterSelect id="status-filter" name="status" label="Estado" defaultValue={query.status ?? ""} submitOnChange>
                  <option value="">Todos</option>
                  <option value="online">En línea</option>
                  <option value="offline">Fuera de línea</option>
                  <option value="unknown">Desconocido</option>
                </FilterSelect>
                <TagCombobox name="tags" initialTags={initialTags} compact ariaLabel="Modalidad" submitOnChange />
                <FilterSelect id="sort-filter" name="sort" label="Ordenar" defaultValue={sort} submitOnChange>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </FilterSelect>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#e0e6eb] pt-3 text-[11px] text-[#77838e]">
                <span>Mostrando {countLabel(servers.length)} en esta página</span>
                {hasActiveFilters ? (
                  <Link href="/servers" className="font-medium text-[#2d34cf] hover:underline">Limpiar filtros</Link>
                ) : null}
              </div>
            </div>
            <button type="submit" className="sr-only">Aplicar filtros</button>
          </form>
        </section>

        {servers.length === 0 ? (
          <div className="mt-7 rounded-2xl border border-[#e0e6eb] bg-[#fbfcff] px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-[#17202a]">Todavía no hay servidores publicados</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#687580]">Sé el primero en publicar una comunidad Minecraft en OpinaCraft.</p>
            <Link href="/servers/new" className="mt-6 inline-flex h-10 items-center rounded-lg bg-[#3029e7] px-4 text-sm font-semibold text-white shadow-[0_5px_12px_rgba(48,41,231,0.16)] transition hover:bg-[#2821c8]">Añadir servidor</Link>
          </div>
        ) : (
          <section className="mt-7" aria-labelledby="server-results-heading">
            <h2 id="server-results-heading" className="sr-only">Resultados de servidores</h2>
            <div className="overflow-hidden rounded-2xl border border-[#e0e6eb] bg-white shadow-[0_1px_2px_rgba(16,30,45,0.02)]">
              <div className="hidden h-10 items-center border-b border-[#e0e6eb] bg-[#f7f8fa] px-4 text-[9px] font-medium uppercase tracking-[0.035em] text-[#7c8799] lg:grid lg:grid-cols-[minmax(330px,1.65fr)_96px_118px_108px_82px_112px_30px] lg:items-center lg:gap-3">
                <span>Servidor</span>
                <span>Edición</span>
                <span>Jugadores</span>
                <span>Versión</span>
                <span>Latencia</span>
                <span>Valoración</span>
                <span className="text-left">IP</span>
              </div>
              {servers.map((server) => <PublicServerRow key={server.id} server={server} />)}
            </div>
            <nav className="mt-5 flex items-center justify-between text-xs" aria-label="Páginas de servidores">
              {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg border border-[#cbd2ff] bg-white px-3.5 py-2 font-medium text-[#2d34cf] transition hover:bg-[#f0f1ff]">Anterior</Link> : <span />}
              {hasNextPage ? <Link href={pageHref(page + 1)} className="rounded-lg border border-[#cbd2ff] bg-white px-3.5 py-2 font-medium text-[#2d34cf] transition hover:bg-[#f0f1ff]">Siguiente</Link> : null}
            </nav>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
