import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowRight, Blocks, CheckCircle2, Code2, Search, ShieldCheck, Star, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ServerLogo } from "@/components/server-logo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { playersLabel, primaryEndpoint, statusLabel } from "@/lib/servers/format";
import { countPublishedServers, listPublishedServers, type CatalogServer } from "@/lib/servers/queries";

export const metadata: Metadata = { title: "Encuentra tu servidor de Minecraft | OpinaCraft", description: "Descubre, compara y comparte comunidades de Minecraft en OpinaCraft.", alternates: { canonical: "/" }, openGraph: { title: "Encuentra tu servidor de Minecraft | OpinaCraft", description: "Descubre, compara y comparte comunidades de Minecraft en OpinaCraft.", type: "website" } };
export const dynamic = "force-dynamic";

const popularTags = [
  { label: "Supervivencia", slug: "supervivencia" },
  { label: "Crossplay", slug: "crossplay" },
  { label: "Vanilla", slug: "vanilla" },
  { label: "Economía", slug: "economia" },
] as const;

const trustPoints = [
  {
    icon: <Activity aria-hidden="true" className="size-4.5" />,
    tone: "text-primary",
    title: "Estado en tiempo real",
    description: "Comprueba si la comunidad está en línea, cuánta gente juega y qué latencia puedes esperar antes de conectarte.",
  },
  {
    icon: <Star aria-hidden="true" className="size-4.5 fill-current" />,
    tone: "text-warning",
    title: "Opiniones con contexto",
    description: "Lee experiencias de otros jugadores, con nota y reseña moderada, y descubre qué hace especial a cada servidor.",
  },
  {
    icon: <Code2 aria-hidden="true" className="size-4.5" />,
    tone: "text-info",
    title: "Conexión sin rodeos",
    description: "Encuentra la edición, la versión y la dirección que necesitas, listas para copiar y entrar en un clic.",
  },
] as const;

function editionLabel(server: CatalogServer) {
  const editions = server.endpoints.map((endpoint) => (endpoint.edition === "bedrock" ? "Bedrock" : "Java"));
  return [...new Set(editions)].join(" · ") || "Sin edición";
}

function StatusPill({ status }: { status: CatalogServer["aggregateStatus"] }) {
  const tone =
    status === "online"
      ? "bg-success-soft text-success"
      : status === "offline"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  const dot = status === "online" ? "bg-success" : status === "offline" ? "bg-destructive" : "bg-muted-foreground/40";

  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[0.6875rem] font-semibold ${tone}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {statusLabel(status)}
    </span>
  );
}

function FeaturedCharacter({ highlight }: { highlight?: CatalogServer }) {
  const endpoint = highlight ? primaryEndpoint(highlight) : undefined;

  return (
    <div className="relative mx-auto w-full max-w-[26.25rem]">
      <div className="relative aspect-square w-full" aria-label="Personaje aventurero de Minecraft">
        <Image
          src="/featured-character.png"
          alt="Personaje aventurero de Minecraft con un pico de diamante"
          fill
          priority
          sizes="(min-width: 1024px) 420px, 100vw"
          className="object-contain object-bottom"
        />
      </div>
      {highlight ? (
        <Card size="sm" className="absolute bottom-12 left-0 w-[14.75rem] shadow-lg lg:-left-10">
          <CardContent className="grid gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <ServerLogo name={highlight.name} media={highlight.media} className="size-8 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-bold tracking-tight">{highlight.name}</p>
                <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                  {editionLabel(highlight)}
                  {highlight.monitor.version ? ` · ${highlight.monitor.version}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-2.5">
              <StatusPill status={highlight.aggregateStatus} />
              <span className="truncate text-[0.6875rem] tabular-nums text-muted-foreground">
                {endpoint ? playersLabel(highlight) : "Sin datos"}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ServerPick({ server }: { server: CatalogServer }) {
  const rating = server.reviewAverage === null
    ? null
    : server.reviewAverage.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3 p-4">
        <ServerLogo name={server.name} media={server.media} className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-bold tracking-tight">
              <Link href={`/servers/${server.slug}`} className="hover:text-primary">{server.name}</Link>
            </h3>
            <StatusPill status={server.aggregateStatus} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {editionLabel(server)}
            {server.monitor.version ? ` · ${server.monitor.version}` : ""}
          </p>
        </div>
      </div>

      <p className="line-clamp-2 min-h-10 px-4 text-[0.8125rem] leading-5 text-muted-foreground">
        {server.description ?? "Una comunidad de Minecraft lista para recibirte."}
      </p>

      {server.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 px-4">
          {server.tags.slice(0, 2).map((tag) => (
            <span key={tag.slug} className="inline-flex h-5.5 items-center rounded-md bg-muted px-2 text-[0.6875rem] font-medium text-muted-foreground">{tag.label}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Users aria-hidden="true" className="size-3.5" />
          <span className="tabular-nums">{playersLabel(server)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {rating ? (
            <>
              <Star aria-hidden="true" className="size-3 fill-current text-warning" />
              <span className="tabular-nums font-medium text-foreground">{rating}</span>
              <span className="tabular-nums">({server.reviewCount})</span>
            </>
          ) : (
            "Sin opiniones"
          )}
        </span>
      </div>
    </Card>
  );
}

export default async function Home() {
  const [{ servers }, publishedCount] = await Promise.all([
    listPublishedServers({ page: 1, sort: "rating" }),
    countPublishedServers(),
  ]);
  const picks = servers.slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b" aria-labelledby="home-heading">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden lg:block"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklch, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 5%, transparent) 1px, transparent 1px)",
              backgroundSize: "2.5rem 2.5rem",
              maskImage: "radial-gradient(ellipse 60% 65% at 76% 45%, #000 10%, transparent 72%)",
              WebkitMaskImage: "radial-gradient(ellipse 60% 65% at 76% 45%, #000 10%, transparent 72%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 42% 55% at 76% 48%, color-mix(in oklch, var(--primary) 13%, transparent), transparent 70%)" }}
          />

          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pt-12 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_26.25rem] lg:items-end lg:gap-10 lg:px-8 lg:pt-16">
            <div className="min-w-0 lg:pb-[4.75rem]">
              {publishedCount > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-success-soft py-1 pl-2.5 pr-3 text-xs font-semibold text-success">
                  <span aria-hidden="true" className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                  </span>
                  {publishedCount} {publishedCount === 1 ? "comunidad comprobada" : "comunidades comprobadas"} automáticamente
                </span>
              ) : null}

              <h1 id="home-heading" className="mt-5 max-w-[40rem] text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Encuentra un servidor al que quieras <span className="text-primary">volver.</span>
              </h1>

              <p className="mt-5 max-w-[33.75rem] text-base leading-7 text-muted-foreground">
                Compara comunidades, comprueba su estado y descubre dónde encaja tu próxima aventura. Sin ruido, con la información que importa.
              </p>

              <form action="/servers" method="get" className="mt-7 flex max-w-[35rem] items-center gap-1.5 rounded-xl border bg-card p-1.5 shadow-sm">
                <div className="relative min-w-0 flex-1">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <label htmlFor="home-search" className="sr-only">Buscar servidores</label>
                  <Input id="home-search" name="q" placeholder="Busca por nombre, IP o modalidad" className="h-11 border-transparent bg-transparent pl-9 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0" />
                </div>
                <Button type="submit" size="lg" className="h-11 shrink-0 px-6 text-base">Buscar</Button>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Populares</span>
                {popularTags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`/servers?tags=${tag.slug}`}
                    className="inline-flex h-7 items-center rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    {tag.label}
                  </Link>
                ))}
              </div>

              <div className="mt-9 grid gap-5 border-t pt-5 sm:grid-cols-3 sm:gap-0 sm:divide-x">
                <div className="sm:pr-6">
                  <Activity aria-hidden="true" className="size-4 text-success" />
                  <p className="mt-2 text-[0.8125rem] font-semibold">Estado en tiempo real</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Comprobamos cada servidor de forma automática.</p>
                </div>
                <div className="sm:px-6">
                  <Blocks aria-hidden="true" className="size-4 text-primary" />
                  <p className="mt-2 text-[0.8125rem] font-semibold">Java y Bedrock</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Con la dirección lista para copiar y entrar.</p>
                </div>
                <div className="sm:pl-6">
                  <ShieldCheck aria-hidden="true" className="size-4 text-warning" />
                  <p className="mt-2 text-[0.8125rem] font-semibold">Opiniones con contexto</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Escritas por jugadores con cuenta verificada.</p>
                </div>
              </div>
            </div>

            <div className="lg:pt-2">
              <FeaturedCharacter highlight={picks[0]} />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-[4.5rem]" aria-labelledby="picks-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 id="picks-heading" className="max-w-[32.5rem] text-2xl font-bold tracking-tight sm:text-[1.875rem]">
                Comunidades que están llamando la atención
              </h2>
              <p className="mt-2.5 max-w-[35rem] text-sm leading-6 text-muted-foreground">
                Una selección del catálogo para que puedas pasar de curiosear a jugar en pocos minutos.
              </p>
            </div>
            <Button variant="link" asChild className="h-auto shrink-0 p-0 font-semibold">
              <Link href="/servers">Ver todo el directorio <ArrowRight className="size-4" /></Link>
            </Button>
          </div>

          {picks.length > 0 ? (
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {picks.map((server) => <ServerPick key={server.id} server={server} />)}
            </div>
          ) : (
            <Empty className="mt-7 rounded-xl border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Blocks /></EmptyMedia>
                <EmptyTitle>Próximamente</EmptyTitle>
                <EmptyDescription>Las próximas comunidades aparecerán aquí.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>

        <section className="border-y bg-muted/40" aria-labelledby="why-heading">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-[4.5rem]">
            <div>
              <h2 id="why-heading" className="text-2xl font-bold tracking-tight sm:text-[1.875rem]">
                Lo importante antes de entrar está a la vista.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Cada ficha reúne señales concretas para que elijas por afinidad, no por una lista interminable de nombres.
              </p>
            </div>

            <div className="divide-y">
              {trustPoints.map((point) => (
                <div key={point.title} className="flex gap-4 py-6 first:pt-0 last:pb-0">
                  <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-card ring-1 ring-foreground/10 ${point.tone}`}>
                    {point.icon}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold tracking-tight">{point.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{point.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-[4.5rem]" aria-labelledby="publish-heading">
          <Card className="flex flex-col gap-8 border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-[35rem]">
              <h2 id="publish-heading" className="text-2xl font-bold tracking-tight sm:text-[1.625rem]">
                Pon tu servidor delante de los jugadores adecuados.
              </h2>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                Crea una ficha pública con estado, conexiones, modalidades y opiniones en un solo lugar.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] font-medium text-success">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="size-3.5" />Ficha pública</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="size-3.5" />Monitor de estado incluido</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="size-3.5" />Opiniones moderadas</span>
              </div>
            </div>
            <Button asChild size="lg" className="h-11 shrink-0 px-6 text-base">
              <Link href="/servers/new">Publicar servidor <ArrowRight className="size-4" /></Link>
            </Button>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
