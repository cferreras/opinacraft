import Link from "next/link";
import { Blocks, CircleX, Code2, Monitor, Star, Users } from "lucide-react";

import type { CatalogServer, PublicServer } from "@/lib/servers/queries";
import { formatEndpoint, latencyClass } from "@/lib/servers/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerLogo } from "@/components/server-logo";

function statusLabel(status: PublicServer["aggregateStatus"]) {
  if (status === "online") return "En línea";
  if (status === "offline") return "Fuera de línea";
  return "Desconocido";
}

function StatusMark({ status }: { status: PublicServer["aggregateStatus"] }) {
  if (status === "offline") return <CircleX aria-hidden="true" className="size-3.5 text-destructive" />;
  return <span aria-hidden="true" className={`size-2 rounded-full ${status === "online" ? "bg-success" : "bg-muted-foreground/40"}`} />;
}

function playersLabel(endpoint: CatalogServer["endpoints"][number] | undefined) {
  if (!endpoint) return "— / —";
  if (endpoint.playersCurrent !== null || endpoint.playersMax !== null) return `${endpoint.playersCurrent ?? "—"} / ${endpoint.playersMax ?? "—"}`;
  return "— / —";
}

function ratingLabel(server: CatalogServer) {
  return server.reviewAverage === null ? "Sin valoraciones" : server.reviewAverage.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Rating({ server, className }: { server: CatalogServer; className: string }) {
  return <div className={className}>{server.reviewAverage !== null ? <Star aria-hidden="true" className="size-3.5 fill-current text-warning" /> : null}<span>{ratingLabel(server)}</span>{server.reviewCount > 0 ? <span className="text-muted-foreground">({server.reviewCount})</span> : null}</div>;
}

export function PublicServerRow({ server }: { server: CatalogServer }) {
  const endpoint = server.endpoints.find((item) => item.edition === "java") ?? server.endpoints[0];
  const endpointAddress = endpoint ? formatEndpoint(endpoint) : server.slug;
  const isUnknown = server.aggregateStatus === "unknown";
  const statusTone = server.aggregateStatus === "online" ? "text-success" : isUnknown ? "text-muted-foreground" : "text-destructive";

  return (
    <article className="grid gap-3 border-t px-3 py-3.5 transition-colors first:border-t-0 hover:bg-muted/30 sm:px-4 xl:grid-cols-[minmax(15.625rem,1.5fr)_5.25rem_6.125rem_5.125rem_3.625rem_4.5rem_1.75rem] xl:items-center xl:gap-2 xl:px-4">
      <div className="flex min-w-0 items-start gap-3"><ServerLogo name={server.name} media={server.media} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold"><Link href={`/servers/${server.slug}`} className="hover:text-primary">{server.name}</Link></h3><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>{server.tags.length > 0 ? <div className="mt-1.5 flex max-w-full flex-wrap gap-1.5 overflow-hidden">{server.tags.slice(0, 4).map((tag) => <Badge key={tag.slug} variant="outline" className="text-[10px]">{tag.label}</Badge>)}</div> : null}</div></div>
      <div className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex"><span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary"><Blocks className="size-3.5" /></span><span>{endpoint?.edition === "bedrock" ? "Bedrock" : "Java"}</span></div>
      <div className="hidden min-w-0 flex-col gap-1 text-xs xl:flex"><span className={`flex items-center gap-1.5 ${statusTone}`}><StatusMark status={server.aggregateStatus} /><span>{statusLabel(server.aggregateStatus)}</span></span><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-3.5" /><span className="tabular-nums">{playersLabel(endpoint)}</span></span></div>
      <div className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex"><Code2 className="size-3.5" /><span className="truncate">{endpoint?.version ?? "—"}</span></div>
      <div className={`hidden text-xs tabular-nums xl:block ${latencyClass(endpoint?.latencyMs ?? null)}`}>{endpoint?.latencyMs !== null && endpoint?.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "—"}</div>
      <Rating server={server} className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex" />
      <div className="hidden justify-end xl:flex"><CopyAddressButton value={endpointAddress} iconOnly /></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground xl:hidden"><div className={`flex min-w-0 items-center gap-1.5 ${statusTone}`}><StatusMark status={server.aggregateStatus} /><span>{statusLabel(server.aggregateStatus)}</span></div><div className="flex min-w-0 items-center justify-end gap-1.5"><Users className="size-3.5" /><span className="tabular-nums">{playersLabel(endpoint)}</span></div><div className="flex min-w-0 items-center gap-1.5"><Monitor className="size-3.5" /><span>{endpoint?.edition === "bedrock" ? "Bedrock" : "Java"}</span><span>·</span><span className="truncate">{endpoint?.version ?? "—"}</span></div><div className={`flex min-w-0 items-center justify-end gap-1.5 ${latencyClass(endpoint?.latencyMs ?? null)}`}>{endpoint?.latencyMs !== null && endpoint?.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "Sin latencia"}</div><Rating server={server} className="col-span-2 flex items-center gap-1 text-xs" /></div>
      <div className="flex items-center justify-between gap-3 xl:hidden"><span className="max-w-[65%] truncate text-xs text-muted-foreground">{endpointAddress}</span><div className="flex items-center gap-2"><CopyAddressButton value={endpointAddress} iconOnly /><Button asChild variant="outline" size="sm"><Link href={`/servers/${server.slug}`}>Ver servidor</Link></Button></div></div>
    </article>
  );
}
