import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  IconBrandDiscord,
  IconChartBar,
  IconClock,
  IconCode,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconExternalLink,
  IconFileText,
  IconShoppingBag,
  IconStarFilled,
  IconUsers,
} from "@tabler/icons-react";

import { CopyAddressButton } from "@/components/copy-address-button";
import { ReportForm } from "@/components/report-form";
import { ReviewSection } from "@/components/review-section";
import { ServerLogo } from "@/components/server-logo";
import { ServerUtilityActions } from "@/components/server-utility-actions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getServerSession } from "@/lib/session";
import { formatEndpoint, latencyClass } from "@/lib/servers/format";
import { getPublishedServerBySlug, type ManagedServer } from "@/lib/servers/queries";
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

function statusLabel(status: "online" | "offline" | "unknown") {
  if (status === "online") return "En línea";
  if (status === "offline") return "Fuera de línea";
  return "Estado desconocido";
}

function statusTone(status: "online" | "offline" | "unknown") {
  if (status === "online") return "text-[#0e9a55]";
  if (status === "offline") return "text-[#d83a42]";
  return "text-[#7c8797]";
}

function dateLabel(date: Date | null) {
  if (!date) return "Aún no comprobado";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function Metric({ icon, label, value, tone = "text-[#162033]" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 border-[#e6eaf0] px-3 py-1.5 first:pl-0 sm:border-l sm:first:border-l-0 sm:first:pl-0">
      <span className="shrink-0 text-[#65718c]">{icon}</span>
      <span className="min-w-0">
        <strong className={`block truncate text-[13px] font-semibold leading-4 ${tone}`}>{value}</strong>
        <span className="block text-[10px] leading-4 text-[#7c8799]">{label}</span>
      </span>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: ManagedServer["endpoints"][number] }) {
  const isJava = endpoint.edition === "java";
  const value = formatEndpoint(endpoint);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isJava ? "bg-[#eef0ff] text-[#2c3be2]" : "bg-[#e9f8ff] text-[#16a0df]"}`}>
        {isJava ? <IconDeviceDesktop aria-hidden="true" size={18} stroke={1.7} /> : <IconDeviceMobile aria-hidden="true" size={18} stroke={1.7} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-semibold ${isJava ? "text-[#3537bf]" : "text-[#178cbf]"}`}>{isJava ? "Java" : "Bedrock"}</p>
        <div className="mt-1 flex h-8 min-w-0 items-center rounded-lg border border-[#dce2e9] bg-white px-2.5">
          <code className="min-w-0 flex-1 truncate text-[11px] text-[#202a42]">{value}</code>
          <CopyAddressButton value={value} iconOnly className="-mr-1 text-[#64708a] hover:bg-[#f1f3ff] hover:text-[#2d2de4]" />
        </div>
      </div>
    </div>
  );
}

function ConnectionLink({ href, icon, label, external = false }: { href?: string | null; icon: React.ReactNode; label: string; external?: boolean }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2.5 rounded-lg border border-[#dde3ea] px-3 text-[11px] font-medium text-[#2d3bdb] transition hover:border-[#9fa8ff] hover:bg-[#f7f7ff]">
      <span className="text-[#4d55f0]">{icon}</span>
      <span className="flex-1">{label}</span>
      {external ? <IconExternalLink aria-hidden="true" size={15} stroke={1.7} className="text-[#7b84a8]" /> : null}
    </a>
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

  const query = await searchParams;
  const requestedReviewPage = Number.parseInt(query.reviewPage ?? "1", 10);
  const session = await getServerSession();
  const [reviewSummary, reviewPage] = await Promise.all([
    getReviewSummary(server.id),
    listServerReviews(server.id, Number.isFinite(requestedReviewPage) ? requestedReviewPage : 1, session?.user.id),
  ]);
  const viewer = session ? await getReviewViewerState(server.id, session.user.id) : null;
  const notice = (query.review ? reviewNotices[query.review] : undefined) ?? (query.reply ? replyNotices[query.reply] : undefined);
  const errorNotice = query.reviewError ? reviewErrors[query.reviewError] : query.replyError ? replyErrors[query.replyError] : undefined;
  const primaryEndpoint = server.endpoints.find((endpoint) => endpoint.edition === "java") ?? server.endpoints[0];
  const copyAddress = primaryEndpoint ? formatEndpoint(primaryEndpoint) : server.slug;
  const rating = reviewSummary.average === null ? "—" : reviewSummary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-main page-shell px-4 pb-12 sm:px-6 lg:px-7 2xl:px-8">
        <div className="pt-7 sm:pt-8">
          <section className="grid gap-6 lg:grid-cols-[214px_minmax(0,1fr)_248px] lg:items-start lg:gap-8" aria-labelledby="server-name">
            <ServerLogo name={server.name} media={server.media} className="h-[100px] w-[100px] justify-self-center rounded-2xl sm:h-[148px] sm:w-[148px] lg:h-[214px] lg:w-[214px] lg:justify-self-start" />

            <div className="min-w-0 text-center lg:text-left">
              <div className="flex flex-wrap items-center gap-3">
                <h1 id="server-name" className="w-full text-[30px] font-bold leading-none tracking-[-0.06em] text-[#101722] sm:text-[38px] lg:w-auto lg:text-[42px]">{server.name}</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f8ef] px-2.5 py-1 text-[11px] font-medium text-[#0c8950]"><span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0e9a55] text-white"><span className="text-[10px] leading-none">✓</span></span>Servidor verificado</span>
              </div>
              <p className="mt-4 max-w-[540px] text-[13px] leading-[1.55] text-[#55627b]">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>
              {server.tags.length > 0 ? <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">{server.tags.map((tag) => <span key={tag.slug} className="rounded-md border border-[#e0e5ea] bg-[#fafbfc] px-2.5 py-1 text-[11px] text-[#35415b]">{tag.label}</span>)}</div> : null}

              <div className="mt-5 grid grid-cols-2 gap-y-1 text-left sm:flex sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
                <Metric icon={<span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${server.aggregateStatus === "online" ? "bg-[#0e9a55]" : server.aggregateStatus === "offline" ? "bg-[#d83a42]" : "bg-[#adb6c2]"}`} />} label="Estado" value={statusLabel(server.aggregateStatus)} tone={statusTone(server.aggregateStatus)} />
                <Metric icon={<IconUsers aria-hidden="true" size={20} stroke={1.7} />} label="jugadores" value={primaryEndpoint?.playersCurrent !== null && primaryEndpoint?.playersMax !== null && primaryEndpoint ? `${primaryEndpoint.playersCurrent} / ${primaryEndpoint.playersMax}` : "— / —"} />
                <Metric icon={<IconCode aria-hidden="true" size={20} stroke={1.7} />} label="versión" value={primaryEndpoint?.version ?? "—"} />
                <Metric icon={<IconChartBar aria-hidden="true" size={20} stroke={1.7} />} label="ping" value={primaryEndpoint?.latencyMs !== null && primaryEndpoint?.latencyMs !== undefined ? `${primaryEndpoint.latencyMs} ms` : "—"} tone={latencyClass(primaryEndpoint?.latencyMs ?? null)} />
                <Metric icon={<IconStarFilled aria-hidden="true" className="text-[#f4aa00]" size={19} />} label={`${reviewSummary.total} opiniones`} value={rating} />
              </div>
            </div>

            <div className="lg:pt-11">
              <CopyAddressButton value={copyAddress} showIcon label="Copiar dirección" className="h-12 w-full rounded-[10px] bg-[#3029e7] text-[13px] font-semibold text-white shadow-[0_5px_12px_rgba(48,41,231,0.16)] transition hover:bg-[#2821c8]" />
              <ServerUtilityActions name={server.name} websiteUrl={server.websiteUrl} discordUrl={server.discordUrl} />
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_348px] lg:items-start">
            <div className="min-w-0">
              <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,30,45,0.02)] sm:p-6" aria-labelledby="about-server">
                <h2 id="about-server" className="text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Sobre {server.name}</h2>
                <p className="mt-4 whitespace-pre-wrap text-[13px] leading-[1.65] text-[#1f2b40]">{server.description ?? "Esta comunidad de Minecraft está preparada para recibirte. Consulta sus canales oficiales para conocer sus normas y novedades."}</p>
                {server.tags.length > 0 ? <div className="mt-5"><p className="text-[12px] font-semibold text-[#1b2638]">Modalidades</p><div className="mt-2 flex flex-wrap gap-2">{server.tags.map((tag) => <span key={tag.slug} className="rounded-md bg-[#f3f5f7] px-2.5 py-1 text-[11px] text-[#35415b]">{tag.label}</span>)}</div></div> : null}
              </section>
              <ReviewSection serverId={server.id} slug={server.slug} summary={reviewSummary} reviews={reviewPage.reviews} page={reviewPage.page} hasNextPage={reviewPage.hasNextPage} viewer={viewer} notice={notice} errorNotice={errorNotice} />
            </div>

            <aside className="order-first min-w-0 rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,30,45,0.02)] lg:order-none" aria-labelledby="connection-heading">
              <h2 id="connection-heading" className="text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Conexión</h2>
              <p className="mt-2 text-[12px] text-[#667287]">Elige tu edición y conéctate:</p>
              <div className="mt-5 grid gap-4">
                {server.endpoints.length ? server.endpoints.map((endpoint) => <EndpointRow key={endpoint.edition} endpoint={endpoint} />) : <p className="rounded-lg bg-[#f5f7f9] p-3 text-xs text-[#6c788b]">No hay direcciones verificadas disponibles.</p>}
              </div>

              <div className="my-6 border-t border-[#e7ebef]" />
              <h3 className="text-[12px] font-semibold text-[#1b2638]">Estado del servidor</h3>
              <div className="mt-3 grid gap-3 text-[12px] text-[#28354a]">
                <div className="flex items-center gap-2.5"><span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${server.aggregateStatus === "online" ? "bg-[#0e9a55]" : server.aggregateStatus === "offline" ? "bg-[#d83a42]" : "bg-[#adb6c2]"}`} /><span className={statusTone(server.aggregateStatus)}>{statusLabel(server.aggregateStatus)}</span></div>
                <div className="flex items-center gap-2.5"><IconChartBar aria-hidden="true" size={18} stroke={1.7} className="text-[#67738b]" /><span>{primaryEndpoint?.latencyMs !== null && primaryEndpoint?.latencyMs !== undefined ? `${primaryEndpoint.latencyMs} ms` : "Sin latencia"}</span></div>
                <div className="flex items-center gap-2.5"><IconClock aria-hidden="true" size={18} stroke={1.7} className="text-[#67738b]" /><span>Última comprobación: {dateLabel(primaryEndpoint?.lastCheckedAt ?? null)}</span></div>
              </div>

              <div className="mt-6 grid gap-2.5">
                <ConnectionLink href={server.websiteUrl} icon={<IconFileText aria-hidden="true" size={17} stroke={1.7} />} label="Web del servidor" />
                <ConnectionLink href={server.storeUrl} icon={<IconShoppingBag aria-hidden="true" size={17} stroke={1.7} />} label="Tienda oficial" />
                <ConnectionLink href={server.discordUrl} icon={<IconBrandDiscord aria-hidden="true" size={17} stroke={1.7} />} label="Soporte en Discord" external />
              </div>

              <p className="mt-6 text-[10px] leading-4 text-[#6e7b8e]">Listado en OpinaCraft desde el {dateLabel(server.createdAt)}.</p>

              {!viewer ? (
                <div className="mt-5 rounded-lg border border-[#e2e7ec] bg-[#fbfcff] p-4">
                  <h3 className="text-[14px] font-semibold text-[#17202a]">Sin iniciar sesión</h3>
                  <p className="mt-2 text-[11px] leading-5 text-[#6e7b8e]">Inicia sesión para publicar tu opinión sobre {server.name}.</p>
                  <Link href={`/sign-in?callbackURL=${encodeURIComponent(`/servers/${server.slug}#reviews`)}`} className="mt-3 inline-flex h-9 w-full items-center justify-between rounded-lg border border-[#cbd2ff] px-3 text-[11px] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff]">Iniciar sesión <span aria-hidden="true" className="text-base leading-none">→</span></Link>
                </div>
              ) : null}
            </aside>
          </section>

          <div id="report" className="mt-5">
            <ReportForm serverId={server.id} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
