import Link from "next/link";
import { BarChart3, Blocks, Code2, ExternalLink, Monitor, Smartphone, Users, Wifi, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerLogo } from "@/components/server-logo";
import type { ManagedServer } from "@/lib/servers/queries";
import { formatEndpoint, latencyClass, playersLabel, primaryEndpoint, statusLabel } from "@/lib/servers/format";

type ServerStatus = ManagedServer["aggregateStatus"];

function statusMark(status: ServerStatus) {
  if (status === "offline") return <XCircle aria-hidden="true" className="size-3.5 text-destructive" />;
  return <span aria-hidden="true" className={`size-2 rounded-full ${status === "online" ? "bg-success" : "bg-muted-foreground/40"}`} />;
}

function roleLabel(role: ManagedServer["role"]) { return role === "owner" ? "Propietario" : role === "admin" ? "Administrador" : "Editor"; }
function publicationLabel(status: ManagedServer["publicationStatus"]) { return status === "published" ? "Publicado" : status === "hidden" ? "Oculto" : "Borrador"; }
function verificationLabel(status: ManagedServer["verificationStatus"]) { return status === "verified" ? "Verificado" : "Pendiente de verificación"; }

function Metric({ icon, label, value, tone = "text-foreground" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return <div className="flex min-w-0 items-center gap-2.5 px-3 py-1.5 first:pl-0 sm:border-l sm:first:border-l-0 sm:first:pl-0"><span className="shrink-0 text-muted-foreground">{icon}</span><span className="min-w-0"><strong className={`block truncate text-sm font-semibold leading-4 ${tone}`}>{value}</strong><span className="block text-xs leading-4 text-muted-foreground">{label}</span></span></div>;
}

function EndpointChip({ endpoint }: { endpoint: ManagedServer["endpoints"][number] }) {
  const isJava = endpoint.edition === "java";
  const address = formatEndpoint(endpoint);
  return <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2"><span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{isJava ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-primary">{isJava ? "Java" : "Bedrock"}</span><code className="mt-0.5 block truncate text-xs">{address}</code></span><CopyAddressButton value={address} iconOnly className="shrink-0" /></div>;
}

export function ServerCard({ server }: { server: ManagedServer }) {
  const endpoint = primaryEndpoint(server);
  const statusTone = server.aggregateStatus === "online" ? "text-success" : server.aggregateStatus === "offline" ? "text-destructive" : "text-muted-foreground";
  return (
    <Card className="overflow-hidden">
      <CardHeader className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div className="flex min-w-0 items-start gap-3.5"><ServerLogo name={server.name} media={server.media} className="size-14 rounded-xl sm:size-16" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2.5"><CardTitle className="truncate text-lg">{server.name}</CardTitle><Badge variant={server.publicationStatus === "published" ? "default" : server.publicationStatus === "hidden" ? "destructive" : "secondary"}>{publicationLabel(server.publicationStatus)}</Badge></div><p className="mt-0.5 truncate text-xs text-muted-foreground">/{server.slug}</p><p className="mt-3 line-clamp-2 max-w-[42.5rem] text-sm leading-5 text-muted-foreground">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>{server.tags.length > 0 ? <div className="mt-2.5 flex flex-wrap gap-1.5">{server.tags.slice(0, 5).map((tag) => <Badge key={tag.slug} variant="outline" className="text-[0.625rem]">{tag.label}</Badge>)}</div> : null}</div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><Button asChild size="sm"><Link href={`/servers/${server.slug}/manage`}>Gestionar servidor</Link></Button>{server.publicationStatus === "published" ? <Button asChild variant="outline" size="sm"><Link href={`/servers/${server.slug}`}>Ver ficha <ExternalLink className="size-3.5" /></Link></Button> : null}</div></CardHeader>
      <CardContent className="grid gap-5 p-0"><div className="grid gap-y-1 border-y bg-muted/30 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 lg:px-5"><Metric icon={statusMark(server.aggregateStatus)} label="Estado" value={statusLabel(server.aggregateStatus)} tone={statusTone} /><Metric icon={<Users className="size-4" />} label="Jugadores" value={playersLabel(server, "— / —")} /><Metric icon={<Code2 className="size-4" />} label="Versión" value={endpoint?.version ?? "—"} /><Metric icon={<BarChart3 className="size-4" />} label="Ping" value={endpoint?.latencyMs !== null && endpoint?.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "—"} tone={latencyClass(endpoint?.latencyMs ?? null)} /></div><div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_13.75rem] lg:items-end"><div className="min-w-0"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Conexiones del servidor</p><p className="mt-1 text-xs text-muted-foreground">Direcciones disponibles para tu comunidad.</p></div><Blocks className="size-5 text-muted-foreground" /></div>{server.endpoints.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{server.endpoints.map((item) => <EndpointChip key={item.edition} endpoint={item} />)}</div> : <p className="mt-3 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Añade un endpoint para empezar la verificación.</p>}</div><div className="border-t pt-3 text-xs leading-5 text-muted-foreground lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><p><span className="text-foreground">Rol:</span> {roleLabel(server.role)}</p><p><span className="text-foreground">Estado público:</span> {publicationLabel(server.publicationStatus)}</p><p><span className="text-foreground">Propiedad:</span> {verificationLabel(server.verificationStatus)}</p><Button asChild variant="link" size="sm" className="mt-2 h-auto p-0"><Link href={`/servers/${server.slug}/manage`}>Editar información <Wifi className="size-3.5" /></Link></Button></div></div></CardContent>
    </Card>
  );
}
