import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  BarChart3,
  Check,
  Clock3,
  Code2,
  ExternalLink,
  Globe,
  MessageCircle,
  Monitor,
  Smartphone,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CopyAddressButton } from "@/components/copy-address-button";
import { PlayerHistoryCard } from "@/components/player-history-card";
import { ReportForm } from "@/components/report-form";
import { ReviewSection } from "@/components/review-section";
import { ServerLogo } from "@/components/server-logo";
import { ServerUtilityActions } from "@/components/server-utility-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerSession } from "@/lib/session";
import { formatServerDateTime } from "@/lib/servers/display";
import { formatEndpoint, latencyClass, primaryEndpoint, statusClass, statusDot, statusLabel } from "@/lib/servers/format";
import { getPublishedServerBySlug, type ManagedServer } from "@/lib/servers/queries";
import { queryPlayerHistory } from "@/lib/servers/player-history";
import { getReviewSummary, getReviewViewerState, listServerReviews } from "@/lib/servers/reviews";

type PublicServerPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reviewPage?: string; review?: string; reviewError?: string; reply?: string; replyError?: string }>;
};

export const dynamic = "force-dynamic";

const getPublishedServer = cache(getPublishedServerBySlug);

const reviewNotices: Record<string, string> = {
  created: "Opinión publicada.",
  updated: "Opinión actualizada.",
  deleted: "Opinión eliminada.",
};

const replyNotices: Record<string, string> = {
  created: "Respuesta oficial publicada.",
  updated: "Respuesta oficial actualizada.",
  deleted: "Respuesta oficial eliminada.",
};

const reviewErrors: Record<string, string> = {
  delete: "No se pudo eliminar la opinión. Inténtalo de nuevo.",
  invalid: "La opinión no es válida.",
  permission: "No tienes permiso para realizar esta acción sobre la opinión.",
  state: "Esta opinión no se puede editar en su estado actual.",
  "not-found": "La opinión ya no está disponible.",
  "rate-limit": "Has alcanzado el límite temporal. Inténtalo más tarde.",
  unknown: "No se pudo completar la acción sobre la opinión.",
};

const replyErrors: Record<string, string> = {
  invalid: "La respuesta oficial no es válida.",
  permission: "No tienes permiso para gestionar esta respuesta oficial.",
  "not-found": "La respuesta oficial ya no está disponible.",
  "rate-limit": "Has alcanzado el límite temporal. Inténtalo más tarde.",
  unknown: "No se pudo completar la acción sobre la respuesta oficial.",
};

function dateLabel(date: Date | null) {
  if (!date) return "Aún no comprobado";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function Metric({ icon, label, value, tone = "text-foreground" }: { icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 border-border px-3 py-1.5 first:pl-0 sm:border-l sm:first:border-l-0 sm:first:pl-0">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <strong className={`block truncate text-sm font-semibold leading-4 ${tone}`}>{value}</strong>
        <span className="block text-[0.6875rem] leading-4 text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: ManagedServer["endpoints"][number] }) {
  const isJava = endpoint.edition === "java";
  const value = formatEndpoint(endpoint);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${isJava ? "bg-primary/10 text-primary" : "bg-info/10 text-info"}`}>
        {isJava ? <Monitor aria-hidden="true" className="size-4" /> : <Smartphone aria-hidden="true" className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${isJava ? "text-primary" : "text-info"}`}>{isJava ? "Java" : "Bedrock"}</p>
        <div className="mt-1 flex h-8 min-w-0 items-center rounded-md border bg-background px-2">
          <code className="min-w-0 flex-1 truncate text-xs text-foreground">{value}</code>
          <CopyAddressButton value={value} iconOnly className="-mr-1" />
        </div>
      </div>
    </div>
  );
}

function ConnectionLink({ href, icon, label, external = false }: { href?: string | null; icon: ReactNode; label: string; external?: boolean }) {
  if (!href) return null;
  return (
    <Button asChild variant="outline" className="h-10 w-full justify-start gap-2.5 text-xs">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <span className="text-primary">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        {external ? <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" /> : null}
      </a>
    </Button>
  );
}

export async function generateMetadata({ params }: PublicServerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const server = await getPublishedServer(slug);
  const socialMedia = server?.media.find((media) => media.kind === "banner" || media.kind === "logo");

  return server
    ? {
        title: `${server.name} | OpinaCraft`,
        description: server.description ?? `Descubre ${server.name} en OpinaCraft.`,
        alternates: { canonical: `/servers/${server.slug}` },
        openGraph: { title: server.name, description: server.description ?? undefined, type: "website", images: socialMedia ? [{ url: socialMedia.url }] : undefined },
      }
    : { title: "Servidor no encontrado | OpinaCraft" };
}

export default async function PublicServerPage({ params, searchParams }: PublicServerPageProps) {
  const { slug } = await params;
  const server = await getPublishedServer(slug);
  if (!server) notFound();

  const [query, session] = await Promise.all([searchParams, getServerSession()]);
  const requestedReviewPage = Number.parseInt(query.reviewPage ?? "1", 10);
  const viewerPromise = session ? getReviewViewerState(server.id, session.user.id) : Promise.resolve(null);
  const [reviewSummary, reviewPage, history, viewer] = await Promise.all([
    getReviewSummary(server.id),
    listServerReviews(server.id, Number.isFinite(requestedReviewPage) ? requestedReviewPage : 1, session?.user.id),
    queryPlayerHistory(server.id, "24h", "all"),
    viewerPromise,
  ]);
  const notice = (query.review ? reviewNotices[query.review] : undefined) ?? (query.reply ? replyNotices[query.reply] : undefined);
  const errorNotice = query.reviewError ? reviewErrors[query.reviewError] : query.replyError ? replyErrors[query.replyError] : undefined;
  const endpoint = primaryEndpoint(server);
  const copyAddress = endpoint ? formatEndpoint(endpoint) : server.slug;
  const rating = reviewSummary.average === null ? "—" : reviewSummary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="pt-7 sm:pt-10">
          <section className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_15rem] lg:items-start lg:gap-8" aria-labelledby="server-name">
            <ServerLogo name={server.name} media={server.media} className="size-24 justify-self-center rounded-2xl sm:size-36 lg:size-52 lg:justify-self-start" />
            <div className="min-w-0 text-center lg:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                <h1 id="server-name" className="w-full text-3xl font-bold tracking-tight sm:text-4xl lg:w-auto">{server.name}</h1>
                <Badge className="bg-success/10 text-success hover:bg-success/15"><span aria-hidden="true" className="mr-1 inline-flex size-3.5 items-center justify-center rounded-full bg-success text-primary-foreground"><Check className="size-2.5 stroke-[3]" /></span>Servidor verificado</Badge>
              </div>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground lg:mx-0">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>
              {server.tags.length > 0 ? <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">{server.tags.map((tag) => <Badge key={tag.slug} variant="outline">{tag.label}</Badge>)}</div> : null}
              <div className="mt-5 grid grid-cols-2 gap-y-1 text-left sm:flex sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
                <Metric icon={<span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${statusDot(server.aggregateStatus)}`} />} label="Estado" value={statusLabel(server.aggregateStatus)} tone={statusClass(server.aggregateStatus)} />
                  <Metric icon={<Users aria-hidden="true" className="size-4" />} label="Jugadores" value={server.monitor.playersCurrent !== null && server.monitor.playersMax !== null ? `${server.monitor.playersCurrent} / ${server.monitor.playersMax}` : "— / —"} />
                  <Metric icon={<Code2 aria-hidden="true" className="size-4" />} label="Versión" value={server.monitor.version ?? "—"} />
                  <Metric icon={<BarChart3 aria-hidden="true" className="size-4" />} label="Ping" value={server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "—"} tone={latencyClass(server.monitor.latencyMs)} />
                <Metric icon={<Star aria-hidden="true" className="size-4 fill-current text-warning" />} label={`${reviewSummary.total} opiniones`} value={rating} />
              </div>
            </div>
            <div className="lg:pt-11">
              <CopyAddressButton value={copyAddress} showIcon label="Copiar dirección" className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90" />
              <ServerUtilityActions name={server.name} websiteUrl={server.websiteUrl} discordUrl={server.discordUrl} />
            </div>
          </section>

          <div className="mt-6"><PlayerHistoryCard serverId={server.id} initialData={history} mode="public" /></div>

          <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="min-w-0">
              <Card aria-labelledby="about-server">
                <CardHeader><CardTitle id="about-server">Sobre {server.name}</CardTitle></CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{server.description ?? "Esta comunidad de Minecraft está preparada para recibirte. Consulta sus canales oficiales para conocer sus normas y novedades."}</p>
                  {server.tags.length > 0 ? <div className="mt-5"><p className="text-xs font-semibold">Modalidades</p><div className="mt-2 flex flex-wrap gap-2">{server.tags.map((tag) => <Badge key={tag.slug} variant="secondary">{tag.label}</Badge>)}</div></div> : null}
                </CardContent>
              </Card>
              <ReviewSection serverId={server.id} slug={server.slug} summary={reviewSummary} reviews={reviewPage.reviews} page={reviewPage.page} hasNextPage={reviewPage.hasNextPage} viewer={viewer} notice={notice} errorNotice={errorNotice} />
            </div>

            <aside className="order-first min-w-0 lg:order-none" aria-labelledby="connection-heading">
              <Card>
                <CardHeader><CardTitle id="connection-heading">Conexión</CardTitle><CardDescription>Elige tu edición y conéctate.</CardDescription></CardHeader>
                <CardContent className="grid gap-4">
                  {server.endpoints.length ? server.endpoints.map((item) => <EndpointRow key={item.edition} endpoint={item} />) : <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">No hay direcciones verificadas disponibles.</p>}
                  <Separator />
                  <div className="grid gap-3 text-sm">
                    <p className="text-xs font-semibold">Estado del servidor</p>
                    <div className="flex items-center gap-2.5"><span aria-hidden="true" className={`size-2.5 rounded-full ${statusDot(server.aggregateStatus)}`} /><span className={statusClass(server.aggregateStatus)}>{statusLabel(server.aggregateStatus)}</span></div>
                    <div className="flex items-center gap-2.5 text-muted-foreground"><BarChart3 aria-hidden="true" className="size-4" /><span>{server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "Sin latencia"}</span></div>
                    <div className="flex items-center gap-2.5 text-muted-foreground"><Clock3 aria-hidden="true" className="size-4" /><span>Última actualización: {formatServerDateTime(server.monitor.lastUpdatedAt)}</span></div>
                    <div className="text-xs text-muted-foreground">Objetivo: {server.monitor.cadenceMinutes ? `cada ${server.monitor.cadenceMinutes} min` : "pendiente de monitorización"}{server.monitor.freshness === "stale" ? " · retrasada" : ""}</div>
                  </div>
                  <div className="grid gap-2.5">
                    <ConnectionLink href={server.websiteUrl} icon={<Globe aria-hidden="true" className="size-4" />} label="Web del servidor" />
                    <ConnectionLink href={server.storeUrl} icon={<ShoppingBag aria-hidden="true" className="size-4" />} label="Tienda oficial" />
                    <ConnectionLink href={server.discordUrl} icon={<MessageCircle aria-hidden="true" className="size-4" />} label="Soporte en Discord" external />
                  </div>
                  <p className="text-xs text-muted-foreground">Listado en OpinaCraft desde el {dateLabel(server.createdAt)}.</p>
                  {!viewer ? <Alert><AlertDescription><strong>Sin iniciar sesión.</strong> Inicia sesión para publicar tu opinión sobre {server.name}. <Button asChild variant="link" size="sm" className="h-auto p-0"><Link href={`/sign-in?callbackURL=${encodeURIComponent(`/servers/${server.slug}#reviews`)}`}>Iniciar sesión</Link></Button></AlertDescription></Alert> : null}
                </CardContent>
              </Card>
            </aside>
          </section>
          <div id="report" className="mt-5"><ReportForm serverId={server.id} /></div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
