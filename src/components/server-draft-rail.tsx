"use client";

import { Blocks, Check, ClipboardCheck, Eye, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { gameModeLabel } from "@/lib/servers/game-modes";
import { Card, CardContent } from "@/components/ui/card";
import { CopyAddressButton } from "@/components/copy-address-button";
import {
  accessTypeLabel,
  accountModeLabel,
  type ServerAccessType,
  type ServerAccountMode,
} from "@/lib/servers/access";
import {
  serverDraftAddresses,
  serverDraftRequiredProgress,
  serverDraftSections,
  type ServerDraft,
  type ServerDraftSectionId,
} from "@/lib/servers/draft-progress";

const sectionAnchors: Record<ServerDraftSectionId, string> = {
  identity: "#identity-heading",
  logo: "#logo-heading",
  endpoints: "#endpoints-heading",
  access: "#access-heading",
};

type ServerDraftRailProps = {
  draft: ServerDraft;
  description: string;
  gameModes: string[];
  logoPreview: string | null;
  accessType: ServerAccessType;
  accountMode: ServerAccountMode;
};

export function ServerDraftRail({ draft, description, gameModes, logoPreview, accessType, accountMode }: ServerDraftRailProps) {
  const sections = serverDraftSections(draft);
  const progress = serverDraftRequiredProgress(draft);
  const [address] = serverDraftAddresses(draft);
  const name = draft.name.trim();
  const summary = description.trim();

  return (
    <aside className="grid gap-4 lg:sticky lg:top-20" aria-label="Progreso de la ficha">
      <Card size="sm">
        <CardContent className="grid gap-3">
          <p className="px-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Secciones</p>
          <nav aria-label="Secciones del formulario" className="grid gap-0.5">
            {sections.map((section) => (
              <a key={section.id} href={sectionAnchors[section.id]} className="flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-colors hover:bg-muted">
                {section.complete
                  ? <span aria-hidden="true" className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>
                  : <span aria-hidden="true" className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full border text-[0.625rem] font-bold tabular-nums text-muted-foreground">{Number(section.number)}</span>}
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{section.title}</span>
                <span className="sr-only">{section.complete ? "Completada" : "Pendiente"}</span>
                {section.optional && !section.complete ? <span className="shrink-0 text-[0.625rem] font-medium text-muted-foreground">Opcional</span> : null}
              </a>
            ))}
          </nav>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between px-1 text-xs font-semibold">
              <span>Campos obligatorios</span>
              <span className="tabular-nums text-muted-foreground">{progress.completed} / {progress.total}</span>
            </div>
            <div className="mx-1 mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="grid gap-3">
          <p className="flex items-center gap-1.5 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <Eye aria-hidden="true" className="size-3.5" /> Vista previa
          </p>
          <div className="rounded-lg bg-muted/45 p-3">
            <div className="flex items-start gap-2.5">
              <Avatar className="size-10 rounded-lg">
                <AvatarImage src={logoPreview ?? undefined} alt="" className="rounded-lg object-contain" />
                <AvatarFallback aria-hidden="true" className="rounded-lg bg-primary/10 text-primary"><Blocks className="size-5" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${name ? "" : "text-muted-foreground"}`}>{name || "Nombre del servidor"}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">{summary || "Tu descripción aparecerá aquí."}</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {accessType === "whitelist" ? <Badge variant="outline" className="text-[0.625rem]"><ClipboardCheck aria-hidden="true" className="size-3" />{accessTypeLabel(accessType)}</Badge> : null}
              {accountMode !== "premium_only" ? <Badge variant="outline" className="text-[0.625rem]"><Users aria-hidden="true" className="size-3" />{accountModeLabel(accountMode)}</Badge> : null}
              {gameModes.slice(0, 2).map((mode) => <Badge key={mode} variant="outline" className="text-[0.625rem]">{gameModeLabel(mode)}</Badge>)}
            </div>
            <div className="mt-2.5 flex h-8 min-w-0 items-center gap-1 rounded-md border bg-background/60 pl-2.5 pr-1">
              {address
                ? <><code className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-muted-foreground">{address.address}</code><CopyAddressButton value={address.address} iconOnly className="-mr-0.5 size-6" /></>
                : <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground">Añade el host para ver la dirección.</span>}
            </div>
          </div>
          <p className="px-1 text-xs leading-4 text-muted-foreground">Así se verá en el directorio. El estado, la versión y la latencia aparecen tras la primera comprobación.</p>
        </CardContent>
      </Card>
    </aside>
  );
}
