import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { type ReactNode } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  ExternalLink,
  Globe,
  KeyRound,
  Monitor,
  Smartphone,
  ShoppingBag,
  ShieldCheck,
  Star,
} from "lucide-react";
import { IconBrandDiscord } from "@tabler/icons-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyAddressButton } from "@/components/copy-address-button";
import { LocalizedTimestamp } from "@/components/localized-timestamp";
import { PlayerHistoryCard } from "@/components/player-history-card";
import { ReportForm } from "@/components/report-form";
import { ReviewSection } from "@/components/review-section";
import { ServerLogo } from "@/components/server-logo";
import { ServerUtilityActions } from "@/components/server-utility-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerSession } from "@/lib/session";
import { accessTypeLabel, accountModeLabel, authModeLabel } from "@/lib/servers/access";
import { editionLabel, formatEndpoint, latencyClass, primaryEndpoint, statusClass, statusDot, statusLabel } from "@/lib/servers/format";
import { getCachedMonitorStatuses, getCachedPublicReviews, getCachedPublishedServer, getCachedReviewSummary } from "@/lib/servers/cached-queries";
import { monitorFromApi, type ManagedServer } from "@/lib/servers/queries";
import { emptyPlayerHistoryResponse } from "@/lib/servers/player-history";
import { getReviewViewerState } from "@/lib/servers/reviews";

type PublicServerPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reviewPage?: string; review?: string; reviewError?: string; reply?: string; replyError?: string }>;
};

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

function Metric({ label, value, detail, tone = "text-foreground" }: { label: string; value: ReactNode; detail?: string; tone?: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5 first:pl-4 sm:border-l sm:first:border-l-0">
      <p className={`flex items-center gap-1.5 truncate text-[0.9375rem] font-bold tracking-tight tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 truncate text-[0.6875rem] text-muted-foreground">{detail ?? label}</p>
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
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{value}</code>
          <CopyAddressButton value={value} iconOnly className="-mr-1" />
        </div>
      </div>
    </div>
  );
}

function ConnectionLink({ href, icon, iconTestId, label }: { href?: string | null; icon: ReactNode; iconTestId?: string; label: string }) {
  if (!href) return null;
  return (
    <Button asChild variant="outline" className="h-10 w-full justify-start gap-2.5 text-xs">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <span data-testid={iconTestId} className="text-primary">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </a>
    </Button>
  );
}

function SummaryRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t pt-2.5 text-xs first:border-t-0 first:pt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[12rem] text-right font-medium">{value}</span>
    </div>
  );
}

export async function generateMetadata({ params }: PublicServerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const server = await getCachedPublishedServer(slug);
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
  await connection();
  const { slug } = await params;
  const serverCore = await getCachedPublishedServer(slug);
  if (!serverCore) notFound();
  let server = serverCore;
  try {
    const monitorStates = await getCachedMonitorStatuses([serverCore.id]);
    if (monitorStates) {
      server = monitorFromApi(serverCore, monitorStates.find((state) => state.serverId === serverCore.id) ?? null);
    }
  } catch (error) {
    console.error("[monitor] detail status unavailable", error instanceof Error ? error.name : "unknown");
  }
  const [query, session] = await Promise.all([searchParams, getServerSession()]);
  const requestedReviewPage = Number.parseInt(query.reviewPage ?? "1", 10);
  const viewerPromise = session ? getReviewViewerState(server.id, session.user.id) : Promise.resolve(null);
  const [reviewSummary, cachedReviewPage, viewer] = await Promise.all([
    getCachedReviewSummary(server.id),
    getCachedPublicReviews(server.id, Number.isFinite(requestedReviewPage) ? requestedReviewPage : 1),
    viewerPromise,
  ]);
  const history = emptyPlayerHistoryResponse("24h");
  const reviewPage = {
    ...cachedReviewPage,
    reviews: cachedReviewPage.reviews.map((review) => ({
      ...review,
      isMine: Boolean(viewer?.review?.id === review.id),
    })),
  };
  const notice = (query.review ? reviewNotices[query.review] : undefined) ?? (query.reply ? replyNotices[query.reply] : undefined);
  const errorNotice = query.reviewError ? reviewErrors[query.reviewError] : query.replyError ? replyErrors[query.replyError] : undefined;
  const endpoint = primaryEndpoint(server);
  const copyAddress = endpoint ? formatEndpoint(endpoint) : server.slug;
  const rating = reviewSummary.average === null ? "—" : reviewSummary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const editions = editionLabel(server);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:px-8">
        <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 py-4 text-xs text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">Inicio</Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground/50" />
          <Link href="/servers" className="transition-colors hover:text-foreground">Explorar</Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground/50" />
          <span className="truncate font-semibold text-foreground">{server.name}</span>
        </nav>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 lg:col-start-1 lg:row-start-1" aria-labelledby="server-name">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <ServerLogo name={server.name} media={server.media} className="size-20 shrink-0 rounded-2xl sm:size-[5.5rem]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h1 id="server-name" className="text-3xl font-bold tracking-tight sm:text-[2.125rem]">{server.name}</h1>
                    <Badge className="bg-success-soft text-success hover:bg-success-soft">
                      <span aria-hidden="true" className="mr-1 inline-flex size-3.5 items-center justify-center rounded-full bg-success text-primary-foreground"><Check className="size-2.5 stroke-[3]" /></span>
                      Servidor verificado
                    </Badge>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{editions || "Sin edición"}</span>
                    {server.monitor.version ? <><span aria-hidden="true">·</span><span className="tabular-nums">{server.monitor.version}</span></> : null}
                    <span aria-hidden="true">·</span>
                    <span>En OpinaCraft desde el <LocalizedTimestamp value={server.createdAt} mode="datetime" /></span>
                  </div>
                  {server.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {server.tags.map((tag) => <Badge key={tag.slug} variant="outline">{tag.label}</Badge>)}
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="mt-5 max-w-[41.25rem] whitespace-pre-wrap text-[0.9375rem] leading-7 text-muted-foreground">
                {server.description ?? "Esta comunidad de Minecraft está preparada para recibirte. Consulta sus canales oficiales para conocer sus normas y novedades."}
              </p>
              <Card size="sm" className="mt-6 grid grid-cols-2 gap-0 overflow-hidden py-0 sm:grid-cols-5">
                <Metric
                  label="Estado"
                  tone={statusClass(server.aggregateStatus)}
                  value={<><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${statusDot(server.aggregateStatus)}`} /><span className="truncate">{statusLabel(server.aggregateStatus)}</span></>}
                />
                <Metric label="Jugadores" value={server.monitor.playersCurrent !== null && server.monitor.playersMax !== null ? `${server.monitor.playersCurrent} / ${server.monitor.playersMax}` : "— / —"} />
                <Metric label="Versión" value={server.monitor.version ?? "—"} />
                <Metric label="Ping" tone={latencyClass(server.monitor.latencyMs)} value={server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "—"} />
                <Metric
                  label="Valoración"
                  detail={`${reviewSummary.total} ${reviewSummary.total === 1 ? "opinión" : "opiniones"}`}
                  value={<><Star aria-hidden="true" className="size-3.5 shrink-0 fill-current text-warning" />{rating}</>}
                />
              </Card>
          </section>

          <aside className="grid min-w-0 gap-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Conexión y acceso">
            <Card className="gap-0 overflow-hidden pb-0" aria-labelledby="connection-heading">
              <CardHeader><CardTitle id="connection-heading">Conectar</CardTitle><CardDescription>Elige tu edición y conéctate.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 pt-4">
                {server.endpoints.length ? server.endpoints.map((item) => <EndpointRow key={`${item.edition}:${item.host}:${item.port}`} endpoint={item} />) : <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">No hay direcciones verificadas disponibles.</p>}
                <CopyAddressButton value={copyAddress} showIcon label="Copiar dirección" className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90" />
              </CardContent>
              {server.websiteUrl || server.storeUrl || server.discordUrl ? (
                <CardContent className="mt-4 grid gap-2.5 border-t pt-4">
                  <p className="text-xs font-semibold">Enlaces oficiales</p>
                  <ConnectionLink href={server.websiteUrl} icon={<Globe aria-hidden="true" className="size-4" />} label="Web del servidor" />
                  <ConnectionLink href={server.storeUrl} icon={<ShoppingBag aria-hidden="true" className="size-4" />} label="Tienda oficial" />
                  <ConnectionLink href={server.discordUrl} icon={<IconBrandDiscord aria-hidden="true" className="size-4" />} iconTestId="discord-icon" label="Soporte en Discord" />
                </CardContent>
              ) : null}
              <div className="mt-4"><ServerUtilityActions name={server.name} /></div>
            </Card>
            <Card aria-labelledby="availability-heading">
              <CardHeader><CardTitle id="availability-heading" className="flex items-center gap-2"><Activity aria-hidden="true" className="size-4 text-primary" />Disponibilidad</CardTitle></CardHeader>
              <CardContent className="grid gap-2.5">
                <SummaryRow label="Última comprobación" value={<LocalizedTimestamp value={server.monitor.lastUpdatedAt} />} />
                {server.monitor.offlineSince ? <SummaryRow label="Fuera de línea desde" value={<LocalizedTimestamp value={server.monitor.offlineSince} />} /> : null}
                {server.monitor.lastRecoveredAt ? <SummaryRow label="Última recuperación" value={<LocalizedTimestamp value={server.monitor.lastRecoveredAt} />} /> : null}
                {server.monitor.lastStateChangeAt ? <SummaryRow label="Último cambio de estado" value={<LocalizedTimestamp value={server.monitor.lastStateChangeAt} />} /> : null}
                <SummaryRow label="Cadencia objetivo" value={server.monitor.cadenceMinutes ? `cada ${server.monitor.cadenceMinutes} min` : "Pendiente"} />
                {server.monitor.freshness === "stale" ? <p className="text-xs leading-5 text-warning">La última comprobación va con retraso; los datos pueden no estar al día.</p> : null}
              </CardContent>
            </Card>
            <Card aria-labelledby="access-summary-heading">
              <CardHeader><CardTitle id="access-summary-heading">Acceso de jugadores</CardTitle><CardDescription>Cómo entrar antes de copiar la dirección.</CardDescription></CardHeader>
              <CardContent className="grid gap-2.5">
                <SummaryRow label="Admisión" value={<Badge variant={server.accessType === "whitelist" ? "default" : "outline"}>{accessTypeLabel(server.accessType)}</Badge>} />
                <SummaryRow label="Cuentas" value={accountModeLabel(server.accountMode)} />
                <SummaryRow label={<span className="flex items-center gap-1.5"><KeyRound aria-hidden="true" className="size-3.5" />Inicio de sesión</span>} value={authModeLabel(server)} />
                {server.accessType === "whitelist" ? (
                  server.accessFormUrl ? (
                    <Button asChild variant="outline" className="mt-1 h-10 w-full justify-between gap-2 text-xs">
                      <a href={server.accessFormUrl} target="_blank" rel="noopener noreferrer">
                        <span className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />Solicitar acceso</span>
                        <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
                      </a>
                    </Button>
                  ) : (
                    <p className="mt-1 rounded-md bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">La whitelist se solicita en los canales oficiales de la comunidad.</p>
                  )
                ) : null}
              </CardContent>
            </Card>
            {!viewer ? (
              <Alert>
                <AlertDescription>
                  <strong>Sin iniciar sesión.</strong> Inicia sesión para publicar tu opinión sobre {server.name}.{" "}
                  <Button asChild variant="link" size="sm" className="h-auto p-0"><Link href={`/sign-in?callbackURL=${encodeURIComponent(`/servers/${server.slug}#reviews`)}`}>Iniciar sesión</Link></Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <div><PlayerHistoryCard serverId={server.id} initialData={history} mode="public" /></div>
            <ReviewSection serverId={server.id} slug={server.slug} summary={reviewSummary} reviews={reviewPage.reviews} page={reviewPage.page} hasNextPage={reviewPage.hasNextPage} viewer={viewer} notice={notice} errorNotice={errorNotice} />
            <div id="report" className="mt-4 scroll-mt-20"><ReportForm serverId={server.id} /></div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
