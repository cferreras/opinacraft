import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ServerCard } from "@/components/server-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireServerSession } from "@/lib/session";
import { listManagedServers } from "@/lib/servers/queries";

type Props = { searchParams?: Promise<{ deleted?: string }> };
function countLabel(count: number) { return `${count} ${count === 1 ? "servidor" : "servidores"}`; }
function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="p-4"><dt className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</dt><dd className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span><span className="text-xs text-muted-foreground">{detail}</span></dd></div>; }

export default async function ManagedServersPage({ searchParams }: Props) {
  const session = await requireServerSession("/dashboard/servers");
  const [servers, query] = await Promise.all([listManagedServers(session.user.id), searchParams ?? Promise.resolve<{ deleted?: string }>({})]);
  const onlineCount = servers.filter((server) => server.aggregateStatus === "online").length;
  const attentionCount = servers.filter((server) => server.publicationStatus !== "published" || server.verificationStatus !== "verified").length;
  return <div className="min-h-screen bg-background"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-8"><section aria-labelledby="managed-servers-heading"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Espacio de gestión</p><h1 id="managed-servers-heading" className="mt-2 text-4xl font-semibold tracking-tight">Tus servidores</h1><p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">Revisa la salud, la publicación y la información pública de tus comunidades.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end"><Button variant="outline" asChild><Link href="/servers">Explorar directorio <ExternalLink className="size-4" /></Link></Button><Button asChild><Link href="/servers/new"><Plus className="size-4" /> Añadir servidor</Link></Button></div></div>{query?.deleted ? <Alert className="mt-5"><AlertDescription>El servidor se ha eliminado correctamente.</AlertDescription></Alert> : null}<dl className="mt-7 grid divide-y rounded-lg border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"><SummaryMetric label="Total" value={String(servers.length)} detail={countLabel(servers.length)} /><SummaryMetric label="Salud" value={String(onlineCount)} detail="en línea ahora" /><SummaryMetric label="Revisión" value={String(attentionCount)} detail="requieren atención" /></dl><div className="mt-8 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">Comunidades gestionadas</h2><p className="mt-1 text-sm text-muted-foreground">Cada ficha reúne lo necesario para mantener tu servidor listo para recibir jugadores.</p></div><span className="text-sm text-muted-foreground">{countLabel(servers.length)}</span></div>{servers.length === 0 ? <Empty className="mt-5 rounded-xl border"><EmptyHeader><EmptyMedia variant="icon"><Plus /></EmptyMedia><EmptyTitle>Todavía no tienes servidores</EmptyTitle><EmptyDescription>Añade tu primera comunidad Minecraft para crear su ficha pública en OpinaCraft.</EmptyDescription></EmptyHeader><Button asChild><Link href="/servers/new"><Plus className="size-4" /> Crear servidor</Link></Button></Empty> : <div className="mt-5 grid gap-4">{servers.map((server) => <ServerCard key={server.id} server={server} />)}</div>}</section></main><SiteFooter variant="compact" /></div>;
}
