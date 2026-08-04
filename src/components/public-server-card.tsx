import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyAddressButton } from "@/components/copy-address-button";
import type { PublicServer } from "@/lib/servers/queries";
import { formatEndpoint } from "@/lib/servers/format";

export function PublicServerCard({ server }: { server: PublicServer }) {
  const banner = server.media.find((media) => media.kind === "banner");
  const statusLabel = server.aggregateStatus === "online" ? "En línea" : server.aggregateStatus === "offline" ? "Fuera de línea" : "Estado desconocido";
  return (
    <Card className="overflow-hidden">
      {banner ? <img src={banner.url} alt="" className="h-32 w-full object-cover" /> : null}
      <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>{server.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">/{server.slug}</p></div><Badge variant={server.aggregateStatus === "online" ? "default" : "secondary"}>{statusLabel}</Badge></CardHeader>
      <CardContent className="grid gap-4">
        {server.description ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{server.description}</p> : null}
        <div className="flex flex-wrap gap-2">{server.endpoints.map((endpoint) => <div key={endpoint.edition} className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs"><code>{endpoint.edition}: {formatEndpoint(endpoint)}</code><CopyAddressButton value={formatEndpoint(endpoint)} iconOnly className="size-6" /><span className="capitalize text-muted-foreground">{endpoint.verificationStatus === "verified" ? "verificado" : "no verificado"}</span></div>)}</div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{server.endpoints.map((endpoint) => <span key={`${endpoint.edition}-health`} className={endpoint.healthStatus === "online" ? "text-success" : endpoint.healthStatus === "offline" ? "text-destructive" : undefined}>{endpoint.edition}: {endpoint.healthStatus}{endpoint.playersCurrent !== null && endpoint.playersMax !== null ? ` · ${endpoint.playersCurrent}/${endpoint.playersMax}` : ""}{endpoint.version ? ` · ${endpoint.version}` : ""}{endpoint.latencyMs !== null ? ` · ${endpoint.latencyMs} ms` : ""}{endpoint.lastCheckedAt ? ` · ${endpoint.lastCheckedAt.toLocaleString("es-ES")}` : ""}</span>)}</div>
        {server.tags.length > 0 ? <div className="flex flex-wrap gap-2">{server.tags.map((tag) => <Badge key={tag.slug} variant="outline">{tag.label}</Badge>)}</div> : null}
      </CardContent>
      <CardFooter><Button asChild variant="link" className="px-0"><Link href={`/servers/${server.slug}`}>Ver servidor</Link></Button></CardFooter>
    </Card>
  );
}
