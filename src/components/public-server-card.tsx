import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyAddressButton } from "@/components/copy-address-button";
import type { PublicServer } from "@/lib/servers/queries";
import { formatEndpoint } from "@/lib/servers/format";
import { accessTypeLabel, accountModeLabel, authModeLabel } from "@/lib/servers/access";
import { gameModeLabel } from "@/lib/servers/game-modes";
import { LocalizedTimestamp } from "@/components/localized-timestamp";
import { ServerDescriptionPreview } from "@/components/server-description-preview";

export function PublicServerCard({ server }: { server: PublicServer }) {
  const banner = server.media.find((media) => media.kind === "banner");
  const statusLabel = server.aggregateStatus === "online" ? "En línea" : server.aggregateStatus === "offline" ? "Fuera de línea" : "Estado desconocido";
  return (
    <Card className="overflow-hidden">
      {banner ? <img src={banner.url} alt={`Imagen de cabecera de ${server.name}`} width={1200} height={256} loading="lazy" className="h-32 w-full object-cover" /> : null}
      <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>{server.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">/{server.slug}</p></div><Badge variant={server.aggregateStatus === "online" ? "default" : "secondary"}>{statusLabel}</Badge></CardHeader>
      <CardContent className="grid gap-4">
        <ServerDescriptionPreview description={server.description} href={`/servers/${server.slug}`} />
        <div className="flex flex-wrap items-center gap-2"><Badge variant={server.accessType === "whitelist" ? "default" : "outline"}>{accessTypeLabel(server.accessType)}</Badge><Badge variant="outline">{accountModeLabel(server.accountMode)}</Badge><Badge variant="outline">{authModeLabel(server)}</Badge>{server.accessType === "whitelist" && server.accessFormUrl ? <a href={server.accessFormUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">Solicitar acceso</a> : null}</div>
        <div className="flex flex-wrap gap-2">{server.endpoints.map((endpoint) => <div key={endpoint.edition} className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs"><code>{endpoint.edition}: {formatEndpoint(endpoint)}</code><CopyAddressButton value={formatEndpoint(endpoint)} iconOnly className="size-6" /><span className="capitalize text-muted-foreground">{endpoint.verificationStatus === "verified" ? "verificado" : "no verificado"}</span></div>)}</div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span className={server.aggregateStatus === "online" ? "text-success" : server.aggregateStatus === "offline" ? "text-destructive" : undefined}>{statusLabel}{server.monitor.playersCurrent !== null && server.monitor.playersMax !== null ? ` · ${server.monitor.playersCurrent}/${server.monitor.playersMax}` : ""}{server.monitor.version ? ` · ${server.monitor.version}` : ""}{server.monitor.latencyMs !== null ? ` · ${server.monitor.latencyMs} ms` : ""}{server.monitor.lastUpdatedAt ? <> · actualizada <LocalizedTimestamp value={server.monitor.lastUpdatedAt} /></> : ""}</span><span>Objetivo: {server.monitor.cadenceMinutes ? `cada ${server.monitor.cadenceMinutes} min` : "sin datos"}</span></div>
        {server.gameModes.length > 0 ? <div className="flex flex-wrap gap-2">{server.gameModes.map((mode) => <Badge key={mode} variant="outline">{gameModeLabel(mode)}</Badge>)}</div> : null}
      </CardContent>
      <CardFooter><Button asChild variant="link" className="px-0"><Link href={`/servers/${server.slug}`}>Ver servidor</Link></Button></CardFooter>
    </Card>
  );
}
