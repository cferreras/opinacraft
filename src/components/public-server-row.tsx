import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardCheck, Star, Users } from "lucide-react";

import { tableGridTemplate } from "@/app/servers/page";
import { StatusPill } from "@/components/server-status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerLogo } from "@/components/server-logo";
import { accessTypeLabel, accountModeLabel } from "@/lib/servers/access";
import { editionLabel, formatEndpoint, latencyClass } from "@/lib/servers/format";
import type { CatalogServer } from "@/lib/servers/queries";

function playersLabel(monitor: CatalogServer["monitor"]) {
  if (monitor.playersCurrent !== null || monitor.playersMax !== null) return `${monitor.playersCurrent ?? "—"} / ${monitor.playersMax ?? "—"}`;
  return "— / —";
}

function ratingLabel(server: CatalogServer) {
  return server.reviewAverage === null ? "Sin valoraciones" : server.reviewAverage.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Rating({ server, className }: { server: CatalogServer; className: string }) {
  return <div className={className}>{server.reviewAverage !== null ? <Star aria-hidden="true" className="size-3.5 fill-current text-warning" /> : null}<span className={server.reviewAverage !== null ? "font-medium tabular-nums text-foreground" : undefined}>{ratingLabel(server)}</span>{server.reviewCount > 0 ? <span className="tabular-nums text-muted-foreground">({server.reviewCount})</span> : null}</div>;
}

function SystemBadge({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <Badge variant="outline" className="text-[0.625rem]">{icon}{children}</Badge>;
}

function AddressField({ value, className = "" }: { value: string; className?: string }) {
  return (
    <div className={`flex h-8 min-w-0 items-center gap-1 rounded-md border bg-muted/40 pl-2.5 pr-1 ${className}`}>
      <code className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-muted-foreground">{value}</code>
      <CopyAddressButton value={value} iconOnly className="-mr-0.5 size-6" />
    </div>
  );
}

export function PublicServerRow({ server }: { server: CatalogServer }) {
  const endpoint = server.endpoints.find((item) => item.edition === "java") ?? server.endpoints[0];
  const endpointAddress = endpoint ? formatEndpoint(endpoint) : server.slug;
  const editions = editionLabel(server);
  const restrictedAccess = server.accessType === "whitelist";
  const openAccounts = server.accountMode !== "premium_only";

  return (
    <article className={`grid gap-2.5 rounded-xl border-none bg-muted/35 p-3.5 transition-colors hover:bg-muted/55 sm:p-4 ${tableGridTemplate} lg:items-center lg:gap-3 lg:rounded-none lg:border-t lg:border-solid lg:bg-transparent lg:px-4 lg:py-3.5 lg:first:border-t-0 lg:hover:bg-muted/30`}>
      <div className="flex min-w-0 items-start gap-3">
        <ServerLogo name={server.name} media={server.media} className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold"><Link href={`/servers/${server.slug}`} className="hover:text-primary">{server.name}</Link></h3>
            <StatusPill status={server.aggregateStatus} className="text-[0.625rem]" />
          </div>
          <p className="hidden text-xs text-muted-foreground lg:mt-0.5 lg:line-clamp-1">{server.description ?? "Una comunidad de Minecraft lista para recibirte."}</p>
          <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 overflow-hidden lg:mt-1.5">
            {restrictedAccess ? <SystemBadge icon={<ClipboardCheck aria-hidden="true" className="size-3" />}>{accessTypeLabel(server.accessType)}</SystemBadge> : null}
            {openAccounts ? <SystemBadge icon={<Users aria-hidden="true" className="size-3" />}>{accountModeLabel(server.accountMode)}</SystemBadge> : null}
            {restrictedAccess && server.accessFormUrl ? <a href={server.accessFormUrl} target="_blank" rel="noopener noreferrer" className="text-[0.625rem] font-semibold text-primary hover:underline">Solicitar acceso</a> : null}
            {server.tags.slice(0, 2).map((tag) => <Badge key={tag.slug} variant="outline" className="text-[0.625rem]">{tag.label}</Badge>)}
          </div>
        </div>
      </div>

      <div className="hidden text-xs text-muted-foreground lg:block"><span className="truncate">{editions}</span></div>
      <div className="hidden text-xs font-medium tabular-nums lg:block">{playersLabel(server.monitor)}</div>
      <div className="hidden truncate text-xs tabular-nums text-muted-foreground lg:block">{server.monitor.version ?? "—"}</div>
      <div className={`hidden text-xs tabular-nums lg:block ${latencyClass(server.monitor.latencyMs)}`}>{server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "—"}</div>
      <Rating server={server} className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex" />
      <AddressField value={endpointAddress} className="hidden lg:flex" />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg bg-background/55 px-2.5 py-2 text-[0.6875rem] text-muted-foreground lg:hidden">
        <div className="flex min-w-0 items-center gap-1.5"><Users aria-hidden="true" className="size-3.5" /><span className="tabular-nums">{playersLabel(server.monitor)}</span></div>
        <div className="flex min-w-0 items-center gap-1"><span className="truncate">{editions}</span><span aria-hidden="true">·</span><span className="truncate tabular-nums">{server.monitor.version ?? "—"}</span></div>
        <div className={`min-w-0 tabular-nums ${latencyClass(server.monitor.latencyMs)}`}>{server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "Sin latencia"}</div>
        <Rating server={server} className="flex items-center gap-1 text-[0.6875rem]" />
      </div>

      <div className="flex items-center gap-2 lg:hidden">
        <AddressField value={endpointAddress} className="h-10 flex-1 bg-background/55" />
        <Button asChild variant="outline" size="sm" className="h-10 shrink-0 px-3"><Link href={`/servers/${server.slug}`}>Ver ficha</Link></Button>
      </div>
    </article>
  );
}
