import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, Eye, FileText, Image as ImageIcon, PlugZap, ShieldCheck, Trophy, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteServerForm } from "@/components/delete-server-form";
import { MediaUploadForm } from "@/components/media-upload-form";
import { MemberPanel } from "@/components/member-panel";
import { PlayerHistoryCard } from "@/components/player-history-card";
import { ServerLogo } from "@/components/server-logo";
import { ServerManageForm } from "@/components/server-manage-form";
import { SiteHeader } from "@/components/site-header";
import { VerificationPanel, VerificationPanelEmpty } from "@/components/verification-panel";
import { VotesSummaryCard } from "@/components/votes-summary-card";
import { VotifierPanel } from "@/components/votifier-panel";
import { formatEndpoint } from "@/lib/servers/format";
import { listServerMembers } from "@/lib/servers/members";
import { toServerManageFormData } from "@/lib/servers/manage-form-data";
import { getManagedServerBySlug, type ManagedServer } from "@/lib/servers/queries";
import { emptyPlayerHistoryResponse } from "@/lib/servers/player-history";
import { getVerificationDisplay } from "@/lib/servers/verification";
import { selectIdentityVerificationTarget } from "@/lib/servers/verification-target";
import { requireServerSession } from "@/lib/session";
import { absoluteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";
import { getCachedServerVoteStats, votesEnabled } from "@/lib/votes/cached";
import { formatVotes } from "@/lib/votes/month";
import { votifierSecretConfigured } from "@/lib/votes/votifier-secret";
import { deriveVotifierStatus, getVotifierDeliveryHealth, getVotifierSettingsView, votifierRailLabels, type VotifierStatus } from "@/lib/votes/votifier-settings";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

type Tone = "success" | "warning" | "danger" | "muted";
type NavGroup = { label: string; links: { href: string; icon: ReactNode; label: string }[] };

export default async function ManageServerPage({ params, searchParams }: Props) {
  await connection();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const session = await requireServerSession(`/servers/${slug}/manage`);
  const server = await getManagedServerBySlug(slug, session.user.id);
  if (!server) notFound();
  const verificationTarget = selectIdentityVerificationTarget(server.endpoints);
  const showVotes = votesEnabled();
  const isOwner = server.role === "owner";
  const canManageTeam = server.role === "owner" || server.role === "admin";
  // Owners and admins decide where votes are delivered; editors only see how the month is going.
  const canConfigureVotifier = canManageTeam;

  const [members, identityVerification, voteStats, votifier] = await Promise.all([
    canManageTeam ? listServerMembers(server.id, session.user.id) : Promise.resolve([]),
    isOwner && verificationTarget ? getVerificationDisplay(server.id, session.user.id, verificationTarget.edition) : Promise.resolve(null),
    showVotes ? getCachedServerVoteStats(server.id) : Promise.resolve(null),
    showVotes ? loadVotifier(server.id) : Promise.resolve(null),
  ]);
  const serverFormData = toServerManageFormData(server);
  const history = emptyPlayerHistoryResponse("24h");
  const hasVotes = showVotes && voteStats && votifier;
  const published = server.publicationStatus === "published";
  const verified = server.verificationStatus === "verified";

  const navGroups: NavGroup[] = [
    {
      label: "Resumen",
      links: [
        { href: "#activity", icon: <Activity aria-hidden="true" />, label: "Actividad" },
        ...(hasVotes ? [{ href: "#votes", icon: <Trophy aria-hidden="true" />, label: "Votos del mes" }] : []),
      ],
    },
    {
      label: "Ficha pública",
      links: [
        { href: "#details", icon: <FileText aria-hidden="true" />, label: "Detalles" },
        { href: "#media", icon: <ImageIcon aria-hidden="true" />, label: "Imágenes de marca" },
      ],
    },
    {
      label: "Configuración",
      links: [
        ...(hasVotes && canConfigureVotifier ? [{ href: "#votifier", icon: <PlugZap aria-hidden="true" />, label: "Votifier" }] : []),
        ...(isOwner ? [{ href: "#verification", icon: <ShieldCheck aria-hidden="true" />, label: "Verificar identidad" }] : []),
        ...(canManageTeam ? [{ href: "#team", icon: <Users aria-hidden="true" />, label: "Miembros" }] : []),
        ...(isOwner ? [{ href: "#danger", icon: <AlertTriangle aria-hidden="true" />, label: "Eliminar servidor" }] : []),
      ],
    },
  ].filter((group) => group.links.length > 0);

  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
        <div className="pt-7 sm:pt-10">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground"><Link href="/dashboard/servers"><ArrowLeft aria-hidden="true" />Mis servidores</Link></Button>

          <header className="mt-4 flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <ServerLogo name={server.name} media={server.media} className="size-14 shrink-0 rounded-xl sm:size-16" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">Panel del servidor</p>
                <h1 className="mt-1 truncate text-2xl font-bold tracking-tight sm:text-3xl">{server.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <StatusPill tone={publicationTone(server.publicationStatus)}>{publicationLabel(server.publicationStatus)}</StatusPill>
                  <StatusPill tone={verified ? "success" : "warning"}>{verified ? "Identidad verificada" : "Identidad sin verificar"}</StatusPill>
                  <span className="text-muted-foreground">Tu rol: <span className="font-medium text-foreground">{roleLabel(server.role)}</span></span>
                </div>
              </div>
            </div>
            {published ? (
              <Button asChild variant="outline" className="shrink-0 self-start sm:self-center"><Link href={`/servers/${server.slug}`}><Eye aria-hidden="true" />Ver página pública<ExternalLink aria-hidden="true" /></Link></Button>
            ) : (
              <p className="shrink-0 self-start rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground sm:self-center">La página pública aún no es visible</p>
            )}
          </header>

          <nav className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="Secciones del servidor">
            {navGroups.flatMap((group) => group.links).map((link) => <Button key={link.href} asChild variant="outline" size="sm" className="shrink-0 text-xs"><a href={link.href}>{link.icon}{link.label}</a></Button>)}
          </nav>

          <div className="mt-5 grid gap-2.5 empty:hidden">
            {query.created ? <Notice>Se creó el borrador. Revísalo y publícalo cuando esté listo.</Notice> : null}
            {query.updated && !query.monitorPaused ? <Notice>Se guardaron los datos del servidor.</Notice> : null}
            {query.updated && query.monitorPaused ? <Notice tone="warning">Se guardaron los cambios, pero al tocar la dirección la ficha vuelve a estar sin verificar: la monitorización queda en pausa y la ficha no aparecerá en el directorio. <a href="#verification" className="underline underline-offset-2">Verifica la dirección nueva</a> para reanudarla.</Notice> : null}
            {!query.monitorPaused && published && !verified ? <Notice tone="warning">La ficha está publicada, pero la monitorización está en pausa y no aparecerá en el directorio hasta que vuelvas a verificar la conexión actual.</Notice> : null}
            {query.memberUpdated ? <Notice>Se actualizó la lista de miembros.</Notice> : null}
            {query.memberError ? <Notice tone="warning">La acción sobre el miembro falló: {query.memberError.replaceAll("-", " ")}.</Notice> : null}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:gap-8">
            <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-[calc(4rem+1.25rem)] lg:self-start">
              <div className="space-y-4">
                <StatusCard server={server} isOwner={isOwner} votes={hasVotes ? { position: voteStats.position, votes: voteStats.votes, votifier: votifier.status } : null} />
                <nav aria-label="Secciones del servidor" className="hidden lg:block">
                  {navGroups.map((group) => (
                    <div key={group.label} className="mt-4 first:mt-0">
                      <p className="px-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</p>
                      <ul className="mt-1 grid gap-0.5">
                        {group.links.map((link) => (
                          <li key={link.href}>
                            <a href={link.href} className="group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0">
                              <span className="group-hover:text-primary">{link.icon}</span>{link.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              </div>
            </aside>

            <div className="min-w-0 space-y-10">
              <Group title="Resumen" description="Cómo se está moviendo tu servidor.">
                <div id="activity" className="scroll-mt-20"><PlayerHistoryCard serverId={server.id} initialData={history} mode="managed" loadOnMount /></div>
                {hasVotes ? <div id="votes" className="scroll-mt-20"><VotesSummaryCard stats={voteStats} voteUrl={absoluteUrl(`/servers/${server.slug}/votar`)} delivery={votifier.health} /></div> : null}
              </Group>

              <Group title="Ficha pública" description="Lo que ven los jugadores en el directorio y en la página del servidor.">
                <div id="details" className="scroll-mt-20"><ServerManageForm server={serverFormData} /></div>
                <div id="media" className="scroll-mt-20"><MediaUploadForm serverId={server.id} /></div>
              </Group>

              {(hasVotes && canConfigureVotifier) || isOwner || canManageTeam ? (
                <Group title="Configuración" description="Integraciones, propiedad del servidor y acceso del equipo.">
                  {hasVotes && canConfigureVotifier ? <div id="votifier" className="scroll-mt-20"><VotifierPanel serverId={server.id} slug={server.slug} settings={votifier.settings} status={votifier.status} defaultHost={defaultVotifierHost(server.endpoints)} available={votifierSecretConfigured()} /></div> : null}
                  {isOwner ? <div id="verification" className="scroll-mt-20">{verificationTarget ? <VerificationPanel serverId={server.id} slug={server.slug} verification={identityVerification} targetEdition={verificationTarget.edition} targetAddress={formatEndpoint(verificationTarget)} /> : <VerificationPanelEmpty />}</div> : null}
                  {canManageTeam ? <div id="team" className="scroll-mt-20"><MemberPanel serverId={server.id} slug={server.slug} members={members} canManage={isOwner} /></div> : null}
                </Group>
              ) : null}

              {isOwner ? (
                <Group title="Zona de peligro" description="Acciones permanentes que no se pueden deshacer." tone="danger">
                  <div id="danger" className="scroll-mt-20"><DeleteServerForm serverId={server.id} slug={server.slug} /></div>
                </Group>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusCard({ server, isOwner, votes }: { server: Pick<ManagedServer, "publicationStatus" | "verificationStatus" | "endpoints">; isOwner: boolean; votes: { position: number | null; votes: number; votifier: VotifierStatus } | null }) {
  const published = server.publicationStatus === "published";
  const verified = server.verificationStatus === "verified";
  // The one thing still standing between this server and the directory, most blocking first.
  const nextStep = !verified && isOwner
    ? { href: "#verification", label: "Verificar identidad", hint: "Verifica la dirección para activar la monitorización y aparecer en el directorio." }
    : !published
      ? { href: "#details", label: "Revisar y publicar", hint: "Publica la ficha desde Detalles cuando esté lista para descubrirse." }
      : null;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Estado</p>
        <dl className="mt-3 grid gap-2.5 text-xs">
          <StatusRow label="Publicación" tone={publicationTone(server.publicationStatus)}>{publicationLabel(server.publicationStatus)}</StatusRow>
          <StatusRow label="Identidad" tone={verified ? "success" : "warning"}>{verified ? "Verificada" : "Pendiente"}</StatusRow>
          {votes ? (
            <>
              <StatusRow label="Ranking del mes">{votes.position !== null ? `#${formatVotes(votes.position)} · ` : ""}{formatVotes(votes.votes)} {votes.votes === 1 ? "voto" : "votos"}</StatusRow>
              <StatusRow label="Votifier" tone={votifierTone[votes.votifier]}>{votifierRailLabels[votes.votifier]}</StatusRow>
            </>
          ) : null}
        </dl>

        <div className="mt-4 border-t pt-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Direcciones</p>
          {server.endpoints.length ? (
            <ul className="mt-2 grid gap-1.5">
              {server.endpoints.map((endpoint) => (
                <li key={endpoint.edition} className="flex min-w-0 items-center gap-2 text-xs">
                  <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", endpoint.verificationStatus === "verified" ? "bg-success" : "bg-warning")} />
                  <span className="w-14 shrink-0 font-medium">{endpoint.edition === "bedrock" ? "Bedrock" : "Java"}</span>
                  <code className="min-w-0 truncate text-muted-foreground" title={formatEndpoint(endpoint)}>{formatEndpoint(endpoint)}</code>
                  <span className="sr-only">{endpoint.verificationStatus === "verified" ? "(verificada)" : "(sin verificar)"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-muted-foreground">Todavía no hay direcciones de conexión.</p>}
        </div>

        {nextStep ? (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs leading-4 text-warning">{nextStep.hint}</p>
            <Button asChild size="sm" className="mt-2.5 w-full justify-between"><a href={nextStep.href}>{nextStep.label}<ArrowRight aria-hidden="true" /></a></Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, tone, children }: { label: string; tone?: Tone; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("inline-flex items-center gap-1.5 font-semibold tabular-nums", tone ? toneText[tone] : "text-foreground")}>
        {tone ? <span aria-hidden="true" className={cn("size-1.5 rounded-full", toneDot[tone])} /> : null}
        {children}
      </dd>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold", tonePill[tone])}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", toneDot[tone])} />
      {children}
    </span>
  );
}

function Group({ title, description, tone, children }: { title: string; description: string; tone?: "danger"; children: ReactNode }) {
  const id = `group-${title.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className={cn("border-b pb-2.5", tone === "danger" && "border-destructive/30")}>
        <h2 id={id} className={cn("text-sm font-semibold", tone === "danger" ? "text-destructive" : "text-foreground")}>{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

const toneText: Record<Tone, string> = { success: "text-success", warning: "text-warning", danger: "text-danger", muted: "text-muted-foreground" };
const toneDot: Record<Tone, string> = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", muted: "bg-muted-foreground/60" };
const tonePill: Record<Tone, string> = { success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger", muted: "bg-muted text-muted-foreground" };

const votifierTone: Record<VotifierStatus, Tone> = {
  connected: "success",
  failing: "danger",
  untested: "warning",
  not_configured: "muted",
};

/** Settings as the panel may see them (never the secret), plus how deliveries went lately. */
async function loadVotifier(serverId: string) {
  const settings = await getVotifierSettingsView(serverId);
  const health = settings ? await getVotifierDeliveryHealth(serverId, settings.updatedAt) : null;
  return { settings, health, status: deriveVotifierStatus(settings, health?.last ?? null) };
}

/** Votifier usually listens on the same machine as the game, so the verified address is the best guess. */
function defaultVotifierHost(endpoints: { host: string; verificationStatus: string }[]) {
  return (endpoints.find((endpoint) => endpoint.verificationStatus === "verified") ?? endpoints[0])?.host ?? "";
}

function Notice({ children, tone = "normal" }: { children: ReactNode; tone?: "normal" | "warning" }) {
  return <Alert className={tone === "warning" ? "border-warning/30 bg-warning/10" : "border-success/30 bg-success/10"}><AlertDescription className={tone === "warning" ? "text-warning" : "text-success"}>{children}</AlertDescription></Alert>;
}

function publicationLabel(status: ManagedServer["publicationStatus"]) {
  if (status === "published") return "Publicado";
  if (status === "hidden") return "Oculto";
  return "Borrador";
}

function publicationTone(status: ManagedServer["publicationStatus"]): Tone {
  if (status === "published") return "success";
  if (status === "hidden") return "muted";
  return "warning";
}

function roleLabel(role: ManagedServer["role"]) {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Administrador";
  return "Editor";
}
