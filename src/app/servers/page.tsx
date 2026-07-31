import type { Metadata } from "next";
import Link from "next/link";

import { PublicServerCard } from "@/components/public-server-card";
import { listPublishedServers, type AggregateHealthStatus } from "@/lib/servers/queries";
import { TagCombobox } from "@/components/tag-combobox";
import { normalizeTagSlug } from "@/lib/servers/tags";

export const metadata: Metadata = {
  title: "Servidores Minecraft | OpinaCraft",
  description: "Descubre comunidades Minecraft en OpinaCraft.",
  alternates: { canonical: "/servers" },
  openGraph: { title: "Servidores Minecraft | OpinaCraft", description: "Descubre comunidades Minecraft en OpinaCraft.", type: "website" },
};

export const dynamic = "force-dynamic";

export default async function PublicServersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tags?: string; edition?: string; status?: string }>;
}) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const { servers, hasNextPage, page } = await listPublishedServers({
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
    query: query.q ?? "",
    tagSlugs: (query.tags ?? "").split(",").map((tag) => normalizeTagSlug(tag)).filter(Boolean),
    edition: query.edition === "java" || query.edition === "bedrock" ? query.edition : undefined,
    status: query.status === "online" || query.status === "offline" || query.status === "unknown" ? query.status as AggregateHealthStatus : undefined,
  });
  const searchParamsForPage = new URLSearchParams();
  if (query.q) searchParamsForPage.set("q", query.q);
  if (query.tags) searchParamsForPage.set("tags", query.tags);
  if (query.edition) searchParamsForPage.set("edition", query.edition);
  if (query.status) searchParamsForPage.set("status", query.status);
  const pageHref = (nextPage: number) => {
    searchParamsForPage.set("page", String(nextPage));
    return `/servers?${searchParamsForPage.toString()}`;
  };

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              OpinaCraft
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              Servidores Minecraft
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Descubre comunidades publicadas y encuentra un servidor al que unirte.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/servers"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Gestionar servidores
            </Link>
            <Link
              href="/servers/new"
              className="inline-flex h-11 items-center rounded-lg bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Añadir servidor
            </Link>
          </div>
        </div>

        <form className="mt-8 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_160px_1fr_160px_auto] dark:border-zinc-800 dark:bg-zinc-900">
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Buscar
            <input name="q" defaultValue={query.q ?? ""} placeholder="Nombre o descripción" className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Edición
            <select name="edition" defaultValue={query.edition ?? ""} className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">Cualquiera</option><option value="java">Java</option><option value="bedrock">Bedrock</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Tags
            <TagCombobox name="tags" initialTags={(query.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)} />
          </label>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Estado<select name="status" defaultValue={query.status ?? ""} className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">Cualquiera</option><option value="online">Online</option><option value="offline">Offline</option><option value="unknown">Desconocido</option></select></label>
          <button type="submit" className="h-10 self-end rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950">Filtrar</button>
        </form>

        {servers.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Todavía no hay servidores publicados
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Sé el primero en publicar una comunidad Minecraft en OpinaCraft.
            </p>
            <Link
              href="/servers/new"
              className="mt-6 inline-flex h-10 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Añadir servidor
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-4">
              {servers.map((server) => (
                <PublicServerCard key={server.id} server={server} />
              ))}
            </div>
            <nav className="mt-8 flex items-center justify-between" aria-label="Server pages">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
                >
                  Anterior
                </Link>
              ) : <span />}
              {hasNextPage ? (
                <Link
                  href={pageHref(page + 1)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
                >
                  Siguiente
                </Link>
              ) : null}
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
