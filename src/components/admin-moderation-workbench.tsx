"use client";

import * as React from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  MessageSquareWarning,
  Server,
  ShieldAlert,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  groupModerationItems,
  type ModerationGroup,
  type ModerationItemKind,
  type ModerationItemStatus,
  type ModerationPriority,
  type ModerationQueueItem,
} from "@/lib/moderation-workbench";
import { cn } from "@/lib/utils";

type ModerationDecision = "dismissed" | "hidden" | "restored" | "reopened";
type ModerationAction = (formData: FormData) => void | Promise<void>;
type QueueFilter = "all" | ModerationItemKind | "repeated";

export function AdminModerationWorkbench({
  items,
  status,
  serverAction,
  reviewAction,
}: {
  items: ModerationQueueItem[];
  status: ModerationItemStatus;
  serverAction: ModerationAction;
  reviewAction: ModerationAction;
}) {
  const [filter, setFilter] = React.useState<QueueFilter>("all");
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const groups = React.useMemo(() => groupModerationItems(items), [items]);
  const visibleGroups = React.useMemo(
    () =>
      groups.filter((group) => {
        if (filter === "all") return true;
        if (filter === "repeated") return group.isRepeated;
        return group.kind === filter;
      }),
    [filter, groups],
  );
  const selectedGroup = groups.find((group) => group.subjectKey === selectedKey) ?? null;
  const highPriorityCount = groups.filter((group) => group.priority === "high").length;
  const repeatedCount = groups.filter((group) => group.isRepeated).length;
  const viewCopy = statusCopy[status];

  return (
    <section aria-labelledby="moderation-queue-heading" className="mt-8">
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_5%,transparent)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Bandeja de trabajo</p>
              <Badge variant="outline" className="font-normal">
                {groups.length} {groups.length === 1 ? "objetivo" : "objetivos"}
              </Badge>
            </div>
            <h2 id="moderation-queue-heading" className="mt-1 text-xl font-semibold tracking-tight">
              {viewCopy.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{viewCopy.description}</p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-sm sm:text-right">
            <SummaryMetric label="Prioridad alta" value={highPriorityCount} tone={highPriorityCount ? "warning" : "muted"} />
            <SummaryMetric label="Varios reportes" value={repeatedCount} tone={repeatedCount ? "danger" : "muted"} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1" aria-label="Filtrar cola" role="group">
            <QueueFilterButton active={filter === "all"} label="Todos" count={groups.length} onClick={() => setFilter("all")} />
            <QueueFilterButton active={filter === "server"} label="Servidores" count={groups.filter((group) => group.kind === "server").length} onClick={() => setFilter("server")} />
            <QueueFilterButton active={filter === "review"} label="Opiniones" count={groups.filter((group) => group.kind === "review").length} onClick={() => setFilter("review")} />
            <QueueFilterButton active={filter === "repeated"} label="Varios reportes" count={repeatedCount} onClick={() => setFilter("repeated")} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <History aria-hidden="true" className="size-3.5" />
            Ordenado por prioridad y actividad reciente
          </p>
        </div>

        {visibleGroups.length ? (
          <div className="grid gap-2" aria-live="polite">
            {visibleGroups.map((group) => (
              <ModerationGroupRow key={group.subjectKey} group={group} onReview={() => setSelectedKey(group.subjectKey)} />
            ))}
          </div>
        ) : (
          <EmptyQueue filter={filter} status={status} />
        )}
      </div>

      <Sheet open={Boolean(selectedGroup)} onOpenChange={(open) => !open && setSelectedKey(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
          {selectedGroup ? (
            <ModerationReviewPanel
              group={selectedGroup}
              serverAction={serverAction}
              reviewAction={reviewAction}
              onClose={() => setSelectedKey(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

const statusCopy: Record<ModerationItemStatus, { title: string; description: string }> = {
  open: {
    title: "Pendientes de revisión",
    description: "Agrupamos los reportes del mismo objetivo para que detectes patrones antes de decidir.",
  },
  actioned: {
    title: "Decisiones recientes",
    description: "Consulta qué se resolvió y reabre un reporte si la decisión necesita volver a revisarse.",
  },
  dismissed: {
    title: "Reportes descartados",
    description: "Nada se borra: puedes recuperar un reporte y devolverlo a la cola manteniendo su historial.",
  },
};

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: "warning" | "danger" | "muted" }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-danger", tone === "muted" && "text-muted-foreground")}>{value}</p>
    </div>
  );
}

function QueueFilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] tabular-nums", active ? "bg-background/15 text-background" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function ModerationGroupRow({ group, onReview }: { group: ModerationGroup; onReview: () => void }) {
  const Icon = group.kind === "server" ? Server : MessageSquareWarning;
  const kindLabel = group.kind === "server" ? "Servidor" : "Opinión";
  const latestReason = reasonLabel(group.items[0]?.reason ?? "other");

  return (
    <article className="group rounded-xl border bg-background/70 transition-colors hover:border-primary/35 hover:bg-accent/35">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", group.priority === "high" ? "bg-danger-soft text-danger" : group.priority === "medium" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
            <Icon aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{group.subjectLabel}</h3>
              <PriorityBadge priority={group.priority} />
              {group.isRepeated ? <Badge variant="outline" className="font-normal">{group.reportCount} reportes</Badge> : null}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {kindLabel} · /{group.serverSlug} · {latestReason} · última actividad {formatDate(group.latestCreatedAt)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-3.5" />
              {group.isRepeated ? "Actividad agrupada para revisión conjunta" : "Un reporte pendiente de revisión"}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="w-full shrink-0 sm:w-auto" onClick={onReview}>
          Revisar
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

function ModerationReviewPanel({ group, serverAction, reviewAction, onClose }: { group: ModerationGroup; serverAction: ModerationAction; reviewAction: ModerationAction; onClose: () => void }) {
  const Icon = group.kind === "server" ? Server : MessageSquareWarning;
  const action = group.kind === "server" ? serverAction : reviewAction;

  return (
    <>
      <SheetHeader className="border-b px-5 py-5 pr-16 text-left">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary"><Icon aria-hidden="true" className="size-4" /></div>
          <Badge variant="outline">{group.kind === "server" ? "Servidor" : "Opinión"}</Badge>
          <PriorityBadge priority={group.priority} />
        </div>
        <SheetTitle className="mt-2 text-lg">{group.subjectLabel}</SheetTitle>
        <SheetDescription>
          {group.reportCount} {group.reportCount === 1 ? "reporte" : "reportes"} · actividad desde {formatDate(group.firstCreatedAt)}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-5">
          {group.isRepeated ? (
            <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <p><span className="font-semibold">Señal de actividad repetida.</span> Hay varios reportes agrupados; confirma cada evidencia antes de aplicar una sanción.</p>
            </div>
          ) : null}
          {group.items.map((item) => (
            <ModerationReportDetail key={item.id} item={item} action={action} />
          ))}
        </div>
      </ScrollArea>

      <SheetFooter className="border-t bg-background/95">
        <p className="text-xs text-muted-foreground">Las decisiones quedan registradas y no eliminan el reporte original.</p>
        <Button type="button" variant="outline" onClick={onClose}>Cerrar revisión</Button>
      </SheetFooter>
    </>
  );
}

function ModerationReportDetail({ item, action }: { item: ModerationQueueItem; action: ModerationAction }) {
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{reasonLabel(item.reason)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)}{item.reporterName ? ` · Reportado por ${item.reporterName}` : ""}</p>
        </div>
        <Badge variant={item.status === "open" ? "secondary" : "outline"}>{statusLabel(item.status)}</Badge>
      </div>
      {item.reviewContent ? <blockquote className="mt-4 border-l-2 pl-3 text-sm leading-6 text-muted-foreground">{item.reviewContent}</blockquote> : null}
      {item.reviewRating ? <p className="mt-3 text-xs font-medium text-muted-foreground">Puntuación: {item.reviewRating}/5</p> : null}
      {item.details ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.details}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.reviewId ? <Button asChild variant="link" size="sm" className="h-auto p-0"><a href={`/servers/${item.serverSlug}#review-${item.reviewId}`} target="_blank" rel="noreferrer">Abrir opinión <ExternalLink aria-hidden="true" /></a></Button> : null}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <ModerationActions action={action} item={item} />
        </div>
      </div>
    </article>
  );
}

function ModerationActions({ action, item }: { action: ModerationAction; item: ModerationQueueItem }) {
  const extra = item.kind === "review" ? [["serverSlug", item.serverSlug] as [string, string]] : [];
  if (item.status === "open") return <><ModerationForm action={action} id={item.id} decision="dismissed" extra={extra} label="Descartar" variant="outline" target={item.kind} /><ModerationForm action={action} id={item.id} decision="hidden" extra={extra} label="Ocultar" variant="destructive" target={item.kind} /></>;
  if (item.status === "dismissed") return <ModerationForm action={action} id={item.id} decision="reopened" extra={extra} label="Reabrir" variant="outline" target={item.kind} />;
  return <ModerationForm action={action} id={item.id} decision="restored" extra={extra} label="Restaurar" variant="outline" target={item.kind} />;
}

const moderationConfirmation = {
  server: {
    dismissed: { title: "¿Descartar este reporte?", description: "El reporte se cerrará sin cambiar la visibilidad del servidor.", confirmLabel: "Sí, descartar" },
    hidden: { title: "¿Ocultar este servidor?", description: "El servidor dejará de mostrarse públicamente. Podrás restaurarlo después.", confirmLabel: "Sí, ocultar" },
    restored: { title: "¿Restaurar este servidor?", description: "El servidor volverá a estar activo en moderación, aunque seguirá sujeto a sus requisitos de publicación.", confirmLabel: "Sí, restaurar" },
    reopened: { title: "¿Reabrir este reporte?", description: "El reporte volverá a la cola de pendientes para que puedas revisarlo de nuevo.", confirmLabel: "Sí, reabrir" },
  },
  review: {
    dismissed: { title: "¿Descartar este reporte?", description: "El reporte se cerrará y la opinión no cambiará de estado.", confirmLabel: "Sí, descartar" },
    hidden: { title: "¿Ocultar esta opinión?", description: "La opinión dejará de mostrarse públicamente. Podrás restaurarla después si no hay otro reporte que la mantenga oculta.", confirmLabel: "Sí, ocultar" },
    restored: { title: "¿Restaurar esta opinión?", description: "La opinión volverá a mostrarse si no hay otro reporte que la mantenga oculta.", confirmLabel: "Sí, restaurar" },
    reopened: { title: "¿Reabrir este reporte?", description: "El reporte volverá a la cola de pendientes para que puedas revisarlo de nuevo.", confirmLabel: "Sí, reabrir" },
  },
} as const;

function ModerationForm({ action, id, decision, extra, label, variant, target }: { action: ModerationAction; id: string; decision: ModerationDecision; extra: [string, string][]; label: string; variant: "outline" | "destructive"; target: ModerationItemKind }) {
  const confirmation = moderationConfirmation[target][decision];
  return <AlertDialog><AlertDialogTrigger asChild><Button type="button" size="sm" variant={variant}>{label}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation.title}</AlertDialogTitle><AlertDialogDescription>{confirmation.description}</AlertDialogDescription></AlertDialogHeader><form action={action}><input type="hidden" name="reportId" value={id} /><input type="hidden" name="decision" value={decision} />{extra.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<AlertDialogFooter><AlertDialogCancel type="button">Cancelar</AlertDialogCancel><Button type="submit" variant={decision === "hidden" ? "destructive" : "default"}>{confirmation.confirmLabel}</Button></AlertDialogFooter></form></AlertDialogContent></AlertDialog>;
}

function PriorityBadge({ priority }: { priority: ModerationPriority }) {
  const copy = { high: "Alta", medium: "Media", low: "Baja" }[priority];
  return <Badge variant="outline" className={cn("font-normal", priority === "high" && "border-danger/35 bg-danger-soft text-danger", priority === "medium" && "border-warning/35 bg-warning-soft text-warning")}>{copy}</Badge>;
}

function EmptyQueue({ filter, status }: { filter: QueueFilter; status: ModerationItemStatus }) {
  const message = status === "open" ? "No hay reportes que revisar con este filtro." : status === "dismissed" ? "No hay reportes descartados con este filtro." : "No hay decisiones recientes con este filtro.";
  return <div className="rounded-xl border border-dashed p-10 text-center"><ShieldAlert aria-hidden="true" className="mx-auto size-7 text-muted-foreground/60" /><p className="mt-3 text-sm font-medium">Cola vacía</p><p className="mt-1 text-sm text-muted-foreground">{filter === "repeated" ? "No hay objetivos con varios reportes en esta vista." : message}</p></div>;
}

function reasonLabel(reason: string) {
  return {
    inappropriate: "Contenido inapropiado",
    misleading: "Información engañosa",
    offline: "Servidor sin conexión",
    copyright: "Derechos de autor",
    spam: "Spam",
    harassment: "Acoso",
    offensive: "Contenido ofensivo",
    false_information: "Información falsa",
    conflict_of_interest: "Conflicto de intereses",
    other: "Otro motivo",
  }[reason] ?? reason;
}

function statusLabel(status: ModerationItemStatus) {
  return { open: "Pendiente", actioned: "Resuelto", dismissed: "Descartado" }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(value));
}
