import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { type ReactNode } from "react";
import {
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

import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyAddressButton } from "@/components/copy-address-button";
import { LocalizedTimestamp } from "@/components/localized-timestamp";
import { PlayerHistoryCard } from "@/components/player-history-card";
import { ReportForm } from "@/components/report-form";
import { ReviewSection } from "@/components/review-section";
import { ServerCountryCode } from "@/components/server-country-code";
import { ServerLogo } from "@/components/server-logo";
import { ServerSectionNav } from "@/components/server-section-nav";
import { ServerUtilityActions, ShareServerButton } from "@/components/server-utility-actions";
import { SiteHeader } from "@/components/site-header";
import { JsonLd } from "@/components/json-ld";
import { buildServerMetaDescription, normalizeServerDescription } from "@/lib/servers/description";
import { getServerSession } from "@/lib/session";
import { OG_IMAGES } from "@/lib/brand/og";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { breadcrumbListSchema, serverSchema } from "@/lib/seo/structured-data";
import { accessTypeLabel, accountModeLabel, authModeLabel } from "@/lib/servers/access";
import { findServerCountry } from "@/lib/servers/countries";
import { gameModeLabel } from "@/lib/servers/game-modes";
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

const pageSections = [
  { id: "actividad", label: "Actividad" },
  { id: "reviews", label: "Opiniones" },
  { id: "acceso", label: "Acceso" },
  { id: "report", label: "Informar" },
] as const;

const overline = "text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground";

function Metric({ label, value, tone = "text-foreground", className = "" }: { label: string; value: ReactNode; tone?: string; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.25 bg-card px-4 py-3.25 sm:py-5.25 ${className}`}>
      <p className={overline}>{label}</p>
      <p className={`flex min-w-0 items-center gap-2 truncate text-[1.0625rem] font-extrabold tracking-tight tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function EndpointRow({ endpoint, primary }: { endpoint: ManagedServer["endpoints"][number]; primary: boolean }) {
  const isJava = endpoint.edition === "java";
  const value = formatEndpoint(endpoint);
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="flex items-center gap-1.5 text-xs font-bold text-foreground/80">
        {isJava ? <Monitor aria-hidden="true" className="size-3.5" /> : <Smartphone aria-hidden="true" className="size-3.5" />}
        <span><span>{isJava ? "Java" : "Bedrock"}</span> Edition</span>
      </p>
      <div className="flex h-12 min-w-0 items-center gap-2 rounded-lg border bg-background pl-3.25 pr-1.25">
        <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-foreground sm:text-sm">{value}</code>
        {primary ? (
          <CopyAddressButton value={value} showIcon label="Copiar" className="h-9.5 gap-1.5 bg-primary px-3.25 text-[0.8125rem] font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground max-sm:w-9.5 max-sm:border max-sm:bg-card max-sm:px-0 max-sm:text-foreground max-sm:[&>span]:sr-only" />
        ) : (
          <CopyAddressButton value={value} iconOnly className="size-9.5 border bg-card text-foreground" />
        )}
      </div>
    </div>
  );
}

function OfficialLink({ href, icon, iconTestId, label, name }: { href?: string | null; icon: ReactNode; iconTestId?: string; label: string; name: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-11 items-center justify-center gap-1.5 rounded-lg sm:flex-col sm:gap-0.5 border text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span data-testid={iconTestId}>{icon}</span>
      {name}
    </a>
  );
}

function FactList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5.25 gap-y-3.25 text-[0.8125rem]">{children}</dl>;
}

function Fact({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </>
  );
}

/** The facts the snippet is built from, shared by `generateMetadata` and the page's schema. */
function serverEditions(server: Pick<ManagedServer, "endpoints">) {
  return [...new Set(server.endpoints.map((endpoint) => (endpoint.edition === "bedrock" ? "Bedrock" : "Java")))];
}

export async function generateMetadata({ params }: PublicServerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const server = await getCachedPublishedServer(slug);
  const socialMedia = server?.media.find((media) => media.kind === "banner" || media.kind === "logo");
  if (server) {
    // Cached alongside the page's own call, so this costs a map lookup rather than a query.
    const summary = await getCachedReviewSummary(server.id);
    const title = `${server.name} | OpinaCraft`;
    const description = buildServerMetaDescription({
      name: server.name,
      editions: serverEditions(server),
      gameModes: server.gameModes.map((mode) => gameModeLabel(mode)),
      accessLabel: accessTypeLabel(server.accessType),
      accountLabel: accountModeLabel(server.accountMode),
      average: summary.average,
      reviewCount: summary.total,
      ownerDescription: server.description,
    });
    return {
      title,
      description,
      alternates: { canonical: `/servers/${server.slug}` },
      openGraph: buildOpenGraph({ title: server.name, description, path: `/servers/${server.slug}`, images: socialMedia ? [{ url: socialMedia.url }] : OG_IMAGES }),
    };
  }
  // Same soft 404 as the blog: the shell has already streamed a 200 by the time
  // notFound() runs, so noindex is what keeps the page out of the index.
  return { title: "Servidor no encontrado | OpinaCraft", robots: { index: false, follow: false } };
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
  const rating = reviewSummary.average === null ? "—" : reviewSummary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const editions = editionLabel(server);
  const country = server.country && server.country !== "global" ? findServerCountry(server.country) : null;
  const description = normalizeServerDescription(server.description) ?? "Esta comunidad de Minecraft está preparada para recibirte. Consulta sus canales oficiales para conocer sus normas y novedades.";
  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      {/* Everything below is on the page as text already; this is the same set of facts in the
          shape a crawler can read. `Product` carries the rating because `GameServer`, the exact
          type, is not eligible for review snippets -- it rides along as `additionalType`. */}
      <JsonLd
        data={[
          breadcrumbListSchema([{ name: "Servidores", path: "/" }, { name: server.name, path: `/servers/${server.slug}` }]),
          serverSchema({
            name: server.name,
            slug: server.slug,
            description,
            image: server.media.find((media) => media.kind === "logo" || media.kind === "banner")?.url ?? null,
            average: reviewSummary.average,
            reviewCount: reviewSummary.total,
            reviews: reviewPage.reviews.map((review) => ({ rating: review.rating, content: review.content, authorName: review.authorName, createdAt: review.createdAt })),
          }),
        ]}
      />
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
        <Breadcrumbs trail={[{ label: "Servidores", href: "/" }]} current={server.name} />
        {/* 1 : φ -- the reading column and the connection rail keep the golden ratio at every width. */}
        {/* Below lg the column wrappers dissolve (`max-lg:contents`) and `order` re-sequences the blocks
            the way a phone reads them: identity, figures, the address, then the longer reading. */}
        <div className="grid items-start gap-5.25 lg:grid-cols-[minmax(0,1.618fr)_minmax(0,1fr)] lg:gap-8.5">
          <div className="min-w-0 max-lg:contents lg:col-start-1 lg:row-start-1 lg:grid lg:gap-8.5">
            <section className="order-1 lg:order-none" aria-labelledby="server-name">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.25 gap-y-3.25 sm:items-start sm:gap-x-5.25 sm:gap-y-2">
                <ServerLogo name={server.name} media={server.media} size={89} monogram className="size-[3.4375rem] rounded-[0.8125rem] text-[1.625rem] sm:row-span-3 sm:size-[5.5625rem] sm:rounded-[1.3125rem] sm:text-[2.625rem]" />
                  <div className="flex flex-col items-start gap-x-3.25 gap-y-1.25 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-2 sm:pt-1">
                    <h1 id="server-name" className="text-[1.625rem] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[2.625rem]">{server.name}</h1>
                    <span className="inline-flex h-6.5 items-center gap-1.25 rounded-full bg-success-soft px-2.5 text-xs font-bold text-primary-ink">
                      <ShieldCheck aria-hidden="true" className="size-3.5" />
                      Verificado
                    </span>
                  </div>
                  <p className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground sm:col-span-1 sm:col-start-2 sm:text-sm">
                    <span className="font-bold text-foreground">{editions}</span>
                    {server.monitor.version ? <><span aria-hidden="true">·</span><span className="tabular-nums">{server.monitor.version}</span></> : null}
                    {country ? <><span aria-hidden="true">·</span><span><ServerCountryCode code={server.country} className="mr-1 text-sm tracking-normal" />{country.label}</span></> : null}
                    <span aria-hidden="true" className="max-sm:hidden">·</span>
                    <span className="max-sm:hidden">En OpinaCraft desde el <LocalizedTimestamp value={server.createdAt} mode="datetime" /></span>
                  </p>
                  {server.gameModes.length > 0 ? (
                    <ul aria-label="Modalidades" className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:col-start-2 sm:mt-1.25 sm:gap-2">
                      {server.gameModes.map((mode) => <li key={mode} className="inline-flex h-6.5 items-center rounded-full border bg-card px-2.5 text-xs font-semibold">{gameModeLabel(mode)}</li>)}
                    </ul>
                  ) : null}
              </div>
            </section>
            {/* 21 px under the identity on desktop: the column's 34 px gap minus 13. */}
            <p className="order-4 max-w-[38rem] text-[0.9375rem] leading-6 text-foreground/75 sm:text-base sm:leading-[1.625rem] lg:order-none lg:-mt-3.25">
              {description}
            </p>

            <section aria-label="Datos clave" className="order-2 grid grid-cols-2 lg:order-none gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
              <Metric
                label="Estado"
                tone={statusClass(server.aggregateStatus)}
                value={<><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${statusDot(server.aggregateStatus)}`} /><span className="truncate">{server.aggregateStatus === "unknown" ? "Desconocido" : statusLabel(server.aggregateStatus)}</span></>}
              />
              <Metric
                label="Jugadores"
                value={server.monitor.playersCurrent !== null && server.monitor.playersMax !== null ? <>{server.monitor.playersCurrent.toLocaleString("es-ES")}<span className="font-semibold text-muted-foreground">/ {server.monitor.playersMax.toLocaleString("es-ES")}</span></> : "— / —"}
              />
              <Metric label="Versión" className="max-sm:hidden" value={server.monitor.version ?? "—"} />
              <Metric label="Ping" tone={latencyClass(server.monitor.latencyMs)} value={server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "—"} />
              <Metric
                label="Valoración"
                value={<><Star aria-hidden="true" className="size-4 shrink-0 fill-current text-rating" />{rating}<span className="text-[0.8125rem] font-semibold text-muted-foreground">({reviewSummary.total})</span></>}
              />
            </section>
          </div>

          <aside className="min-w-0 max-lg:contents lg:sticky lg:grid lg:gap-5.25 lg:top-[calc(4rem+1.5rem)] lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Conexión y acceso">
            <Card className="order-3 gap-0 py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_21px_-13px_rgb(0_0_0/0.18)] lg:order-none" aria-labelledby="connection-heading">
              <div className="flex items-center justify-between gap-3 px-5.25 pt-5.25">
                <h2 id="connection-heading" className="text-[1.0625rem] font-extrabold tracking-tight">Conectar</h2>
                {server.aggregateStatus === "online" && server.monitor.playersCurrent !== null ? (
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-ink tabular-nums">
                    <span aria-hidden="true" className="size-1.75 rounded-full bg-success" />
                    {server.monitor.playersCurrent.toLocaleString("es-ES")} jugando ahora
                  </p>
                ) : (
                  <p className={`inline-flex items-center gap-1.5 text-xs font-bold ${statusClass(server.aggregateStatus)}`}>
                    <span aria-hidden="true" className={`size-1.75 rounded-full ${statusDot(server.aggregateStatus)}`} />
                    {statusLabel(server.aggregateStatus)}
                  </p>
                )}
              </div>
              <div className="grid gap-3.25 p-5.25">
                {server.endpoints.length ? (
                  <>
                    {server.endpoints.map((item) => <EndpointRow key={`${item.edition}:${item.host}:${item.port}`} endpoint={item} primary={item === endpoint} />)}
                    <p className="text-xs leading-[1.1875rem] text-muted-foreground max-sm:hidden">
                      Multijugador → Añadir servidor → pega la dirección.
                      {server.endpoints.some((item) => item.edition === "bedrock") ? " En Bedrock, el puerto va en su propio campo." : null}
                    </p>
                  </>
                ) : <p className="rounded-lg bg-muted p-3.25 text-xs text-muted-foreground">No hay direcciones verificadas disponibles.</p>}
              </div>
              {server.websiteUrl || server.storeUrl || server.discordUrl ? (
                <nav aria-label="Enlaces oficiales" className="grid auto-cols-fr grid-flow-col gap-2 px-5.25 pb-5.25 sm:border-t sm:pt-3.25">
                  <OfficialLink href={server.websiteUrl} icon={<Globe aria-hidden="true" className="size-3.5" />} label="Web del servidor" name="Web" />
                  <OfficialLink href={server.discordUrl} icon={<IconBrandDiscord aria-hidden="true" className="size-3.5" />} iconTestId="discord-icon" label="Soporte en Discord" name="Discord" />
                  <OfficialLink href={server.storeUrl} icon={<ShoppingBag aria-hidden="true" className="size-3.5" />} label="Tienda oficial" name="Tienda" />
                </nav>
              ) : null}
              <div className="max-sm:hidden"><ServerUtilityActions name={server.name} /></div>
            </Card>

            <Card id="acceso" className="order-8 scroll-mt-24 gap-3.25 p-5.25 lg:order-none" aria-labelledby="access-summary-heading">
              <h2 id="access-summary-heading" className="text-[0.9375rem] font-extrabold">Acceso de jugadores</h2>
              <FactList>
                <Fact label="Admisión" value={accessTypeLabel(server.accessType)} />
                <Fact label="Cuentas" value={accountModeLabel(server.accountMode)} />
                <Fact label={<span className="inline-flex items-center gap-1.5"><KeyRound aria-hidden="true" className="size-3.5" />Inicio de sesión</span>} value={authModeLabel(server)} />
              </FactList>
              {server.accessType === "whitelist" ? (
                server.accessFormUrl ? (
                  <Button asChild variant="outline" className="mt-1 h-11 w-full justify-between gap-2 text-xs font-bold">
                    <a href={server.accessFormUrl} target="_blank" rel="noopener noreferrer">
                      <span className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />Solicitar acceso</span>
                      <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    </a>
                  </Button>
                ) : (
                  <p className="mt-1 rounded-lg bg-muted px-3.25 py-2.5 text-xs leading-5 text-muted-foreground">La whitelist se solicita en los canales oficiales de la comunidad.</p>
                )
              ) : null}
            </Card>

            <Card className="order-8 gap-3.25 p-5.25 max-sm:hidden lg:order-none" aria-labelledby="availability-heading">
              <h2 id="availability-heading" className="text-[0.9375rem] font-extrabold">Monitorización</h2>
              <FactList>
                <Fact label="Última comprobación" value={<LocalizedTimestamp value={server.monitor.lastUpdatedAt} />} />
                {server.monitor.offlineSince ? <Fact label="Fuera de línea desde" value={<LocalizedTimestamp value={server.monitor.offlineSince} />} /> : null}
                {server.monitor.lastRecoveredAt ? <Fact label="Última recuperación" value={<LocalizedTimestamp value={server.monitor.lastRecoveredAt} />} /> : null}
                {server.monitor.lastStateChangeAt ? <Fact label="Último cambio de estado" value={<LocalizedTimestamp value={server.monitor.lastStateChangeAt} />} /> : null}
                <Fact label="Frecuencia" value={server.monitor.cadenceMinutes ? `cada ${server.monitor.cadenceMinutes} min` : "Pendiente"} />
              </FactList>
              {server.monitor.freshness === "stale" ? <p className="text-xs leading-5 text-warning">La última comprobación va con retraso; los datos pueden no estar al día.</p> : null}
            </Card>
          </aside>

          <div className="min-w-0 max-lg:contents lg:col-start-1 lg:row-start-2 lg:grid lg:gap-5.25">
            <div className="order-5 min-w-0 lg:order-none"><ServerSectionNav sections={pageSections.map((section) => (section.id === "reviews" ? { ...section, count: reviewSummary.total } : section))} /></div>
            <div id="actividad" className="order-6 min-w-0 scroll-mt-24 lg:order-none"><PlayerHistoryCard serverId={server.id} initialData={history} mode="public" /></div>
            <div className="order-7 min-w-0 lg:order-none"><ReviewSection serverId={server.id} slug={server.slug} summary={reviewSummary} reviews={reviewPage.reviews} page={reviewPage.page} hasNextPage={reviewPage.hasNextPage} viewer={viewer} notice={notice} errorNotice={errorNotice} /></div>
            <div id="report" className="order-9 min-w-0 scroll-mt-24 lg:order-none"><ReportForm serverId={server.id} /></div>
          </div>
        </div>
      </main>
      {/* On phones the rail scrolls away, so the one action people came for stays within thumb reach. */}
      {endpoint ? (
        <div className="sticky bottom-0 z-20 flex gap-2 border-t bg-background/95 px-4 pb-5.25 pt-3.25 shadow-[0_-8px_21px_-13px_rgb(0_0_0/0.2)] backdrop-blur sm:px-6 lg:hidden">
          <CopyAddressButton
            value={formatEndpoint(endpoint)}
            showIcon
            label={`Copiar IP ${endpoint.edition === "java" ? "Java" : "Bedrock"}`}
            className="h-12 flex-1 bg-primary text-[0.9375rem] font-extrabold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          />
          <ShareServerButton name={server.name} />
        </div>
      ) : null}
    </div>
  );
}
