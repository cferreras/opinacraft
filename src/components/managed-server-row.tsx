import Link from "next/link";
import { CircleCheck, CircleX, ExternalLink, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerLogo } from "@/components/server-logo";
import { editionLabel, formatEndpoint, latencyClass, playersLabel, primaryEndpoint, statusLabel } from "@/lib/servers/format";
import { monitorCheckedLabel } from "@/lib/servers/managed-servers";
import type { ManagedServer } from "@/lib/servers/queries";

export const managedTableGridTemplate = "lg:grid-cols-[minmax(0,1fr)_7.5rem_7rem_5.5rem_5rem_8.25rem_9rem]";

function publicationLabel(status: ManagedServer["publicationStatus"]) {
  return status === "published" ? "Publicado" : status === "hidden" ? "Oculto" : "Borrador";
}

function publicationVariant(status: ManagedServer["publicationStatus"]) {
  return status === "published" ? "default" : status === "hidden" ? "destructive" : "secondary";
}

function StatusMark({ status }: { status: ManagedServer["aggregateStatus"] }) {
  if (status === "offline") return <CircleX aria-hidden="true" className="size-3.5 shrink-0" />;
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${status === "online" ? "bg-success" : "bg-muted-foreground/40"}`} />;
}

function statusTone(status: ManagedServer["aggregateStatus"]) {
  return status === "online" ? "text-success" : status === "offline" ? "text-destructive" : "text-muted-foreground";
}

function VerificationNote({ server }: { server: ManagedServer }) {
  if (server.verificationStatus === "verified") {
    return <span className="mt-1 flex items-center gap-1 text-[0.6875rem] text-success"><CircleCheck aria-hidden="true" className="size-3" />Verificado</span>;
  }
  return <span className="mt-1 flex items-center gap-1 text-[0.6875rem] text-warning"><TriangleAlert aria-hidden="true" className="size-3" />Sin verificar</span>;
}

function PlayerGauge({ server }: { server: ManagedServer }) {
  const current = server.monitor.playersCurrent;
  const max = server.monitor.playersMax;
  const ratio = current !== null && max !== null && max > 0 ? Math.min(1, current / max) : 0;

  return (
    <>
      <span className="block text-xs font-semibold tabular-nums">{playersLabel(server)}</span>
      <span aria-hidden="true" className="mt-1.5 block h-[3px] w-16 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-success" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </>
  );
}

export function ManagedServerRow({ server }: { server: ManagedServer }) {
  const endpoint = primaryEndpoint(server);
  const address = endpoint ? formatEndpoint(endpoint) : server.slug;
  const manageHref = `/servers/${server.slug}/manage`;

  return (
    <article className={`grid gap-3 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10 sm:p-4 ${managedTableGridTemplate} lg:items-center lg:gap-0 lg:rounded-none lg:border-t lg:bg-transparent lg:px-5 lg:py-4 lg:ring-0 lg:first-of-type:border-t-0 lg:hover:bg-muted/30`}>
      <div className="flex min-w-0 items-center gap-3 lg:pr-4">
        <ServerLogo name={server.name} media={server.media} className="size-10 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold"><Link href={manageHref} className="hover:text-primary">{server.name}</Link></h3>
            <Badge variant={publicationVariant(server.publicationStatus)} className="shrink-0 text-[0.625rem] lg:hidden">{publicationLabel(server.publicationStatus)}</Badge>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <code className="truncate font-mono text-[0.6875rem]">{address}</code>
            <CopyAddressButton value={address} iconOnly className="size-5 shrink-0" />
            <span aria-hidden="true" className="hidden lg:inline">·</span>
            <span className="hidden shrink-0 lg:inline">{editionLabel(server)}</span>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <span className={`flex items-center gap-1.5 text-xs font-medium ${statusTone(server.aggregateStatus)}`}><StatusMark status={server.aggregateStatus} />{statusLabel(server.aggregateStatus)}</span>
        <span className="mt-1 block text-[0.6875rem] text-muted-foreground">{monitorCheckedLabel(server)}</span>
      </div>
      <div className="hidden lg:block"><PlayerGauge server={server} /></div>
      <div className="hidden truncate text-xs tabular-nums text-muted-foreground lg:block">{server.monitor.version ?? "—"}</div>
      <div className={`hidden text-xs font-semibold tabular-nums lg:block ${latencyClass(server.monitor.latencyMs)}`}>{server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "—"}</div>
      <div className="hidden lg:block">
        <Badge variant={publicationVariant(server.publicationStatus)}>{publicationLabel(server.publicationStatus)}</Badge>
        <VerificationNote server={server} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background/55 px-2.5 py-2 text-[0.6875rem] text-muted-foreground lg:hidden">
        <span className={`flex items-center gap-1.5 font-medium ${statusTone(server.aggregateStatus)}`}><StatusMark status={server.aggregateStatus} />{statusLabel(server.aggregateStatus)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{playersLabel(server)}</span>
        <span aria-hidden="true">·</span>
        <span className={`tabular-nums ${latencyClass(server.monitor.latencyMs)}`}>{server.monitor.latencyMs !== null ? `${server.monitor.latencyMs} ms` : "Sin ping"}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{server.monitor.version ?? "—"}</span>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <Button asChild size="lg" className="h-11 flex-1 lg:h-8 lg:flex-none"><Link href={manageHref}>Gestionar</Link></Button>
        {server.publicationStatus === "published" ? (
          <Button asChild variant="outline" size="icon" className="size-11 shrink-0 lg:size-8">
            <Link href={`/servers/${server.slug}`} aria-label={`Ver la ficha pública de ${server.name}`}><ExternalLink className="size-4" /></Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
