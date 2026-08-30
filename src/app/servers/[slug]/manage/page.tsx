import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { type ReactNode } from "react";
import { Activity, ArrowLeft, Check, ChevronRight, ExternalLink, Eye, FileText, Image as ImageIcon, ShieldCheck, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteServerForm } from "@/components/delete-server-form";
import { MediaUploadForm } from "@/components/media-upload-form";
import { MemberPanel } from "@/components/member-panel";
import { PlayerHistoryCard } from "@/components/player-history-card";
import { ServerLogo } from "@/components/server-logo";
import { ServerManageForm } from "@/components/server-manage-form";
import { SiteHeader } from "@/components/site-header";
import { VerificationPanel, VerificationPanelEmpty } from "@/components/verification-panel";
import { formatEndpoint } from "@/lib/servers/format";
import { listServerMembers } from "@/lib/servers/members";
import { toServerManageFormData } from "@/lib/servers/manage-form-data";
import { getManagedServerBySlug } from "@/lib/servers/queries";
import { emptyPlayerHistoryResponse } from "@/lib/servers/player-history";
import { getVerificationDisplay } from "@/lib/servers/verification";
import { selectIdentityVerificationTarget } from "@/lib/servers/verification-target";
import { requireServerSession } from "@/lib/session";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ManageServerPage({ params, searchParams }: Props) {
  await connection();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const session = await requireServerSession(`/servers/${slug}/manage`);
  const server = await getManagedServerBySlug(slug, session.user.id);
  if (!server) notFound();
  const verificationTarget = selectIdentityVerificationTarget(server.endpoints);

  const [members, identityVerification] = await Promise.all([
    server.role === "owner" || server.role === "admin" ? listServerMembers(server.id, session.user.id) : Promise.resolve([]),
    server.role === "owner" && verificationTarget ? getVerificationDisplay(server.id, session.user.id, verificationTarget.edition) : Promise.resolve(null),
  ]);
  const serverFormData = toServerManageFormData(server);
  const history = emptyPlayerHistoryResponse("24h");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="pt-7 sm:pt-10">
          <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground"><Link href="/dashboard/servers"><ArrowLeft aria-hidden="true" />Volver a mis servidores</Link></Button>
              <div className="mt-5 flex items-center gap-3.5">
                <ServerLogo name={server.name} media={server.media} className="size-14 rounded-xl sm:size-16" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">Espacio del servidor</p>
                  <h1 className="mt-1 truncate text-3xl font-bold tracking-tight sm:text-4xl">Gestionar {server.name}</h1>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline"><span className="mr-1 text-muted-foreground">Rol:</span><span className="capitalize">{server.role}</span></Badge>
                <Badge variant="outline"><span className="mr-1 text-muted-foreground">Verificación:</span><span className="capitalize">{server.verificationStatus}</span></Badge>
                <Badge className={server.publicationStatus === "published" ? "bg-success/10 text-success hover:bg-success/15" : "bg-warning/10 text-warning hover:bg-warning/15"}><span aria-hidden="true" className={`mr-1.5 size-1.5 rounded-full ${server.publicationStatus === "published" ? "bg-success" : "bg-warning"}`} />{publicationLabel(server.publicationStatus)}</Badge>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {server.publicationStatus === "published" ? <Button asChild variant="outline"><Link href={`/servers/${server.slug}`}><Eye aria-hidden="true" />Ver página pública<ExternalLink aria-hidden="true" /></Link></Button> : <Badge variant="outline" className="h-9 px-3"><Eye aria-hidden="true" className="mr-2" />Vista previa del borrador</Badge>}
            </div>
          </header>

          <nav className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Secciones del servidor">
            <SectionLink href="#activity" icon={<Activity aria-hidden="true" />}>Actividad</SectionLink>
            <SectionLink href="#details" icon={<FileText aria-hidden="true" />}>Detalles</SectionLink>
            <SectionLink href="#media" icon={<ImageIcon aria-hidden="true" />}>Marca</SectionLink>
            {server.role === "owner" ? <SectionLink href="#verification" icon={<ShieldCheck aria-hidden="true" />}>Identidad</SectionLink> : null}
            {(server.role === "owner" || server.role === "admin") ? <SectionLink href="#team" icon={<Users aria-hidden="true" />}>Miembros</SectionLink> : null}
          </nav>

          <div className="mt-5 grid gap-2.5">
            {query.created ? <Notice>Se creó el borrador. Revísalo y publícalo cuando esté listo.</Notice> : null}
            {query.updated ? <Notice>Se guardaron los datos del servidor.</Notice> : null}
            {query.memberUpdated ? <Notice>Se actualizó la lista de miembros.</Notice> : null}
            {query.memberError ? <Notice tone="warning">La acción sobre el miembro falló: {query.memberError.replaceAll("-", " ")}.</Notice> : null}
          </div>

          <div id="activity" className="mt-5 scroll-mt-5"><PlayerHistoryCard serverId={server.id} initialData={history} mode="managed" loadOnMount /></div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <div className="min-w-0 space-y-5">
              <Card id="details" className="scroll-mt-5"><CardHeader><PanelHeading eyebrow="Ficha pública" title="Detalles del servidor" description="Mantén la ficha clara, útil y lista para que los jugadores se unan." /></CardHeader><CardContent><ServerManageForm server={serverFormData} /></CardContent></Card>
              <div id="media" className="scroll-mt-5"><MediaUploadForm serverId={server.id} /></div>
              {server.role === "owner" ? <div id="verification" className="scroll-mt-5">{verificationTarget ? <VerificationPanel serverId={server.id} slug={server.slug} verification={identityVerification} targetEdition={verificationTarget.edition} targetAddress={formatEndpoint(verificationTarget)} /> : <VerificationPanelEmpty />}</div> : null}
              {(server.role === "owner" || server.role === "admin") ? <div id="team" className="scroll-mt-5"><MemberPanel serverId={server.id} slug={server.slug} members={members} canManage={server.role === "owner"} /></div> : null}
              {server.role === "owner" ? <DeleteServerForm serverId={server.id} slug={server.slug} /> : null}
            </div>

            <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-[calc(4rem+1.25rem)] lg:self-start">
              <div className="space-y-4">
                <Card><CardHeader><CardDescription className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Vista pública</CardDescription><div className="mt-2 flex items-center gap-3"><ServerLogo name={server.name} media={server.media} className="size-11 rounded-lg" /><div className="min-w-0"><CardTitle className="truncate text-sm">{server.name}</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">/{server.slug}</p></div></div></CardHeader><CardContent><div className="rounded-md border bg-muted/30 p-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Estado de la ficha</span><span className={server.publicationStatus === "published" ? "font-semibold text-success" : "font-semibold text-warning"}>{publicationLabel(server.publicationStatus)}</span></div><div className="mt-2.5 flex items-center justify-between gap-3"><span className="text-muted-foreground">Identidad verificada</span><span className="inline-flex items-center gap-1 font-semibold text-success"><Check aria-hidden="true" className="size-3.5" />{server.verificationStatus === "verified" ? "Lista" : "Pendiente"}</span></div></div>{server.publicationStatus === "published" ? <Button asChild size="lg" className="mt-3 w-full justify-between"><Link href={`/servers/${server.slug}`}>Abrir página pública<ChevronRight aria-hidden="true" /></Link></Button> : <p className="mt-3 rounded-md bg-warning/10 px-3 py-2.5 text-xs leading-4 text-warning">Publica la ficha desde Detalles cuando esté lista para descubrirse.</p>}</CardContent></Card>

                <Card><CardHeader><CardTitle className="text-sm">Espacio de trabajo</CardTitle><CardDescription>Haz cambios, verifica la identidad y mantén al equipo sincronizado.</CardDescription></CardHeader><CardContent className="grid gap-1"><RailLink href="#details" icon={<FileText aria-hidden="true" />}>Editar ficha</RailLink><RailLink href="#media" icon={<ImageIcon aria-hidden="true" />}>Gestionar marca</RailLink>{server.role === "owner" ? <RailLink href="#verification" icon={<ShieldCheck aria-hidden="true" />}>Verificar identidad</RailLink> : null}{(server.role === "owner" || server.role === "admin") ? <RailLink href="#team" icon={<Users aria-hidden="true" />}>Gestionar miembros</RailLink> : null}</CardContent></Card>

                <Card><CardHeader><CardTitle className="text-sm">Conexión</CardTitle><CardDescription>Direcciones asociadas a esta ficha.</CardDescription></CardHeader><CardContent className="grid gap-2.5">{server.endpoints.length ? server.endpoints.map((endpoint) => <div key={endpoint.edition} className="flex min-w-0 items-center gap-2.5 rounded-md border bg-muted/20 px-3 py-2.5"><span className={`size-2 shrink-0 rounded-full ${endpoint.verificationStatus === "verified" ? "bg-success" : "bg-warning"}`} /><div className="min-w-0"><p className="text-xs font-semibold capitalize">{endpoint.edition}</p><code className="mt-0.5 block truncate text-xs text-muted-foreground">{formatEndpoint(endpoint)}</code></div></div>) : <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">Todavía no hay direcciones de conexión.</p>}</CardContent></Card>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function Notice({ children, tone = "normal" }: { children: ReactNode; tone?: "normal" | "warning" }) {
  return <Alert className={tone === "warning" ? "border-warning/30 bg-warning/10" : "border-success/30 bg-success/10"}><AlertDescription className={tone === "warning" ? "text-warning" : "text-success"}>{children}</AlertDescription></Alert>;
}

function publicationLabel(status: "draft" | "published" | "hidden") {
  if (status === "published") return "Publicado";
  if (status === "hidden") return "Oculto";
  return "Borrador";
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</p><h2 className="mt-1.5 text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1.5 max-w-xl text-sm leading-5 text-muted-foreground">{description}</p></div>;
}

function SectionLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return <Button asChild variant="outline" size="sm" className="shrink-0 text-xs"><a href={href}>{icon}{children}</a></Button>;
}

function RailLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return <Button asChild variant="ghost" className="group h-9 w-full justify-start gap-2.5 px-2.5 text-xs"><a href={href}><span className="text-muted-foreground group-hover:text-primary">{icon}</span><span className="flex-1 text-left">{children}</span><ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" /></a></Button>;
}
