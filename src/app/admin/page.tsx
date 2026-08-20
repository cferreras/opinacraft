import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, Tag as TagIcon } from "lucide-react";

import { moderateReportAction, moderateReviewReportAction, moderateTagAction, grantRoleAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminModerationWorkbench } from "@/components/admin-moderation-workbench";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPlatformRole, listOpenReports, listOpenReviewReports } from "@/lib/admin";
import { listModerationTags } from "@/lib/servers/tags";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; status?: string }> }) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const role = await getPlatformRole(session.user.id);
  if (!role) redirect("/");
  const query = await searchParams;
  const reportStatus = query.status === "actioned" || query.status === "dismissed" ? query.status : "open";
  const [reports, reviewReports, tags] = await Promise.all([listOpenReports(reportStatus), listOpenReviewReports(reportStatus), listModerationTags()]);
  const moderationItems = [
    ...reports.map((report) => ({
      id: report.id,
      kind: "server" as const,
      subjectKey: `server:${report.serverId}`,
      subjectLabel: report.serverName,
      serverSlug: report.serverSlug,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    })),
    ...reviewReports.map((report) => ({
      id: report.id,
      kind: "review" as const,
      subjectKey: report.reviewId ? `review:${report.reviewId}` : `review-report:${report.id}`,
      subjectLabel: report.serverName,
      serverSlug: report.serverSlug,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      reviewId: report.reviewId,
      reviewContent: report.reviewContent,
      reviewRating: report.reviewRating,
      reporterName: report.reporterName,
    })),
  ];
  const moderationErrorMessage = query.error === "report-open"
    ? "No se puede reabrir este reporte porque el mismo usuario ya tiene otro reporte abierto para este servidor."
    : query.error === "review-report-open"
      ? "No se puede reabrir este reporte porque el mismo usuario ya tiene otro reporte abierto para esta opinión."
      : query.error === "transition"
        ? "El reporte ya no está en el estado esperado. Actualiza la cola e inténtalo de nuevo."
        : "No se pudo completar la acción de moderación.";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Moderación</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Cola de moderación</h1><p className="mt-2 text-sm text-muted-foreground">Rol: <span className="font-medium capitalize text-foreground">{role}</span>. Las decisiones quedan registradas en un historial inmutable.</p></div>
          <div className="flex flex-wrap gap-2"><Button asChild variant={reportStatus === "open" ? "default" : "outline"} size="sm"><a href="/admin">Pendientes</a></Button><Button asChild variant={reportStatus === "actioned" ? "default" : "outline"} size="sm"><a href="/admin?status=actioned">Resueltos</a></Button><Button asChild variant={reportStatus === "dismissed" ? "default" : "outline"} size="sm"><a href="/admin?status=dismissed">Descartados</a></Button></div>
        </header>
        {query.updated ? <Alert className="mt-5 border-success/30 bg-success/10"><CheckCircle2 aria-hidden="true" className="text-success" /><AlertDescription className="text-success">La acción se completó correctamente.</AlertDescription></Alert> : null}
        {query.error ? <Alert variant="destructive" className="mt-5"><AlertCircle aria-hidden="true" /><AlertDescription>{moderationErrorMessage}</AlertDescription></Alert> : null}

        <AdminModerationWorkbench items={moderationItems} status={reportStatus} serverAction={moderateReportAction} reviewAction={moderateReviewReportAction} />

        <section className="mt-10" aria-labelledby="tags-heading">
          <Card><CardHeader><div className="flex items-center gap-2"><TagIcon aria-hidden="true" className="size-5 text-primary" /><CardTitle id="tags-heading">Etiquetas</CardTitle></div><CardDescription>Revisa el uso y el estado de las etiquetas del catálogo.</CardDescription></CardHeader><CardContent>{tags.length ? <div className="divide-y rounded-md border">{tags.map((tag) => <div key={tag.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{tag.label}</p><p className="text-xs text-muted-foreground">{tag.usageCount} usos · <span className="capitalize">{tag.status}</span></p></div><div className="flex flex-wrap items-center gap-2"><form action={moderateTagAction}><input type="hidden" name="tagAction" value="block" /><input type="hidden" name="tagId" value={tag.id} /><Button type="submit" variant="outline" size="sm">Bloquear</Button></form><form action={moderateTagAction} className="flex items-center gap-2"><input type="hidden" name="tagAction" value="rename" /><input type="hidden" name="tagId" value={tag.id} /><Input name="label" placeholder="Nuevo nombre" className="h-8 w-32 text-xs" aria-label={`Nuevo nombre para ${tag.label}`} /><Button type="submit" variant="ghost" size="sm" className="h-8">Renombrar</Button></form></div></div>)}</div> : <EmptyState>No hay etiquetas para moderar.</EmptyState>}</CardContent></Card>
        </section>

        {role === "admin" ? <section className="mt-10" aria-labelledby="roles-heading"><Card><CardHeader><CardTitle id="roles-heading">Gestionar roles</CardTitle><CardDescription>Concede permisos de moderación a una cuenta existente.</CardDescription></CardHeader><CardContent><form action={grantRoleAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"><Field><FieldLabel htmlFor="role-email">Correo electrónico</FieldLabel><Input id="role-email" required type="email" name="email" placeholder="cuenta@ejemplo.com" /></Field><Field><FieldLabel htmlFor="role-value">Rol</FieldLabel><NativeSelect id="role-value" name="role"><option value="moderator">Moderador</option><option value="admin">Administrador</option></NativeSelect></Field><Button type="submit">Conceder rol</Button></form></CardContent></Card></section> : null}
      </main>
      <SiteFooter variant="compact" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
