import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconBrandMinecraft,
  IconChartBar,
  IconCircleCheckFilled,
  IconCode,
  IconSearch,
  IconStarFilled,
  IconUsers,
} from "@tabler/icons-react";

import { ServerLogo } from "@/components/server-logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { playersLabel, primaryEndpoint, statusClass, statusDot, statusLabel } from "@/lib/servers/format";
import { listPublishedServers, type CatalogServer } from "@/lib/servers/queries";

export const metadata: Metadata = {
  title: "Encuentra tu servidor de Minecraft | OpinaCraft",
  description: "Descubre, compara y comparte comunidades de Minecraft en OpinaCraft.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Encuentra tu servidor de Minecraft | OpinaCraft",
    description: "Descubre, compara y comparte comunidades de Minecraft en OpinaCraft.",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

function FeaturedCharacter() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[24.375rem]" aria-label="Personaje aventurero de Minecraft">
      <Image
        src="/featured-character.png"
        alt="Personaje aventurero de Minecraft con un pico de diamante"
        fill
        priority
        sizes="(min-width: 1024px) 527px, 100vw"
        className="object-contain object-bottom"
      />
    </div>
  );
}

function ServerPick({ server }: { server: CatalogServer }) {
  const endpoint = primaryEndpoint(server);
  const rating = server.reviewAverage === null
    ? "Sin opiniones"
    : `${server.reviewAverage.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${server.reviewCount})`;

  return (
    <article className="group rounded-xl border border-[#e0e6eb] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#cbd2ff] hover:shadow-[0_0.5rem_1.25rem_rgba(32,46,68,0.06)]">
      <div className="flex items-start gap-3">
        <ServerLogo name={server.name} media={server.media} className="h-10 w-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-[0.8125rem] font-semibold text-[#101722]">
              <Link href={`/servers/${server.slug}`} className="rounded-sm outline-none hover:text-[#2d34cf] focus-visible:ring-2 focus-visible:ring-[#4655e8]/30">{server.name}</Link>
            </h3>
            <span className={`inline-flex shrink-0 items-center gap-1 text-[0.625rem] font-medium ${statusClass(server.aggregateStatus)}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusDot(server.aggregateStatus)}`} />
              {statusLabel(server.aggregateStatus)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[0.625rem] text-[#7c8799]">{endpoint?.edition === "bedrock" ? "Bedrock" : "Java"} · {endpoint?.version ?? "Versión no indicada"}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.375rem] text-[0.6875rem] leading-[1.7] text-[#55627b]">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>
      <div className="mt-4 flex items-center justify-between border-t border-[#edf0f3] pt-3 text-[0.625rem] text-[#68758a]">
        <span className="inline-flex items-center gap-1.5"><IconUsers aria-hidden="true" size="0.8125rem" stroke={1.7} />{playersLabel(server)}</span>
        <span className="inline-flex items-center gap-1.5"><IconStarFilled aria-hidden="true" className="text-[#f4a51c]" size="0.75rem" />{rating}</span>
      </div>
    </article>
  );
}

function TrustPoint({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#e0e6eb] bg-white p-4">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef0ff] text-[#2d34cf]">{icon}</span>
      <h3 className="mt-3 text-[0.8125rem] font-semibold tracking-[-0.01em] text-[#17202a]">{title}</h3>
      <p className="mt-1.5 text-[0.6875rem] leading-[1.65] text-[#68758a]">{description}</p>
    </div>
  );
}

export default async function Home() {
  const { servers } = await listPublishedServers({ page: 1, sort: "rating" });
  const picks = servers.slice(0, 3);

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="app-main page-shell">
        <section className="border-b border-[#e4e8ed] px-4 pb-0 pt-10 sm:px-6 sm:pt-12 lg:px-7 lg:pt-16 2xl:px-10 2xl:pt-20" aria-labelledby="home-heading">
          <div className="grid gap-10 lg:items-end lg:grid-cols-[minmax(0,1fr)_24.375rem] lg:gap-14">
            <div className="min-w-0 lg:pb-14">
              <p className="inline-flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[#2d34cf]">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#2d34cf]" />
                Directorio de comunidades Minecraft
              </p>
              <h1 id="home-heading" className="mt-4 max-w-[41.25rem] text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.055em] text-[#101722] sm:text-[2.75rem]">
                Encuentra un servidor al que quieras <span className="text-[#2d34cf]">volver.</span>
              </h1>
              <p className="mt-5 max-w-[36.25rem] text-[0.875rem] leading-[1.65] text-[#55627b] sm:text-[0.9375rem]">
                Compara comunidades, comprueba su estado y descubre dónde encaja tu próxima aventura. Sin ruido, con la información que importa.
              </p>

              <form action="/servers" method="get" className="mt-7 flex h-12 max-w-[38.75rem] items-center rounded-lg border border-[#cfd7e0] bg-white p-1.5 shadow-[0_0.125rem_0.3125rem_rgba(16,30,45,0.04)] focus-within:border-[#4655e8] focus-within:ring-2 focus-within:ring-[#4655e8]/10">
                <IconSearch aria-hidden="true" className="ml-2.5 shrink-0 text-[#7b8796]" size="1.125rem" stroke={1.7} />
                <label htmlFor="home-search" className="sr-only">Buscar servidores</label>
                <input id="home-search" name="q" placeholder="Busca por nombre o IP" className="ml-3 min-w-0 flex-1 bg-transparent text-[0.75rem] text-[#27324a] outline-none placeholder:text-[#7c8797]" />
                <button type="submit" className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-[#3029e7] px-4 text-[0.75rem] font-semibold text-white transition hover:bg-[#2821c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4655e8]/40 focus-visible:ring-offset-2">Buscar</button>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.6875rem] text-[#68758a]">
                <Link href="/servers" className="font-semibold text-[#2d34cf] hover:underline hover:underline-offset-4">Explorar el directorio →</Link>
                <span className="hidden h-3 w-px bg-[#dfe4ea] sm:block" />
                <Link href="/servers/new" className="hover:text-[#17202a]">Publicar mi servidor</Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#edf0f3] pt-4 text-[0.625rem] text-[#7c8797]">
                <span className="inline-flex items-center gap-1.5"><IconCircleCheckFilled aria-hidden="true" className="text-[#0e9a55]" size="0.8125rem" />Estado comprobado</span>
                <span className="inline-flex items-center gap-1.5"><IconBrandMinecraft aria-hidden="true" className="text-[#2d34cf]" size="0.875rem" stroke={1.7} />Java y Bedrock</span>
                <span className="inline-flex items-center gap-1.5"><IconStarFilled aria-hidden="true" className="text-[#f4a51c]" size="0.75rem" />Opiniones de jugadores</span>
              </div>
            </div>

            <div className="lg:pt-2">
              <FeaturedCharacter />
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-12 lg:px-7 2xl:px-10 2xl:py-14" aria-labelledby="picks-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[#2d34cf]">Para empezar</p>
              <h2 id="picks-heading" className="mt-2 text-[1.5rem] font-semibold tracking-[-0.045em] text-[#101722]">Comunidades que están llamando la atención</h2>
              <p className="mt-2 max-w-[37.5rem] text-[0.75rem] leading-6 text-[#68758a]">Una selección del catálogo para que puedas pasar de curiosear a jugar en pocos minutos.</p>
            </div>
            <Link href="/servers" className="shrink-0 text-[0.6875rem] font-semibold text-[#2d34cf] hover:underline hover:underline-offset-4">Ver todos los servidores →</Link>
          </div>

          {picks.length > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {picks.map((server) => <ServerPick key={server.id} server={server} />)}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-[#d8dfe7] bg-[#fbfcff] px-5 py-8 text-center text-[0.75rem] text-[#68758a]">Las próximas comunidades aparecerán aquí.</div>
          )}
        </section>

        <section className="border-y border-[#e4e8ed] bg-[#f7f8fa] px-4 py-10 sm:px-6 sm:py-12 lg:px-7 2xl:px-10 2xl:py-14" aria-labelledby="why-heading">
          <div className="max-w-[41.25rem]">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[#2d34cf]">Una decisión más fácil</p>
            <h2 id="why-heading" className="mt-2 text-[1.5rem] font-semibold tracking-[-0.045em] text-[#101722]">Lo importante antes de entrar está a la vista.</h2>
            <p className="mt-2 text-[0.75rem] leading-6 text-[#68758a]">Cada ficha reúne señales concretas para que elijas por afinidad, no por una lista interminable de nombres.</p>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <TrustPoint icon={<IconChartBar aria-hidden="true" size="1.0625rem" stroke={1.7} />} title="Estado en tiempo real" description="Comprueba si la comunidad está en línea, cuánta gente juega y qué latencia puedes esperar." />
            <TrustPoint icon={<IconStarFilled aria-hidden="true" size="1.0625rem" />} title="Opiniones con contexto" description="Lee experiencias de otros jugadores y descubre qué hace especial a cada servidor." />
            <TrustPoint icon={<IconCode aria-hidden="true" size="1.0625rem" stroke={1.7} />} title="Conexión sin rodeos" description="Encuentra la edición y la dirección que necesitas, listas para copiar y entrar." />
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-12 lg:px-7 2xl:px-10 2xl:py-14" aria-labelledby="publish-heading">
          <div className="flex flex-col gap-6 rounded-2xl border border-[#dfe4ff] bg-[#f7f7ff] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="max-w-[40rem]">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[#4547ca]">Para quienes construyen comunidad</p>
              <h2 id="publish-heading" className="mt-2 text-[1.375rem] font-semibold tracking-[-0.04em] text-[#151a38]">Pon tu servidor delante de los jugadores adecuados.</h2>
              <p className="mt-2 text-[0.75rem] leading-6 text-[#59627f]">Crea una ficha pública con estado, conexiones, modalidades y opiniones en un solo lugar.</p>
            </div>
            <Link href="/servers/new" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[#3029e7] px-4 text-[0.75rem] font-semibold text-white shadow-[0_0.3125rem_0.75rem_rgba(48,41,231,0.14)] transition hover:bg-[#2821c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4655e8]/40 focus-visible:ring-offset-2">Publicar servidor →</Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
