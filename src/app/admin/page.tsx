import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { moderateReportAction, moderateReviewReportAction, grantRoleAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminModerationWorkbench } from "@/components/admin-moderation-workbench";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SiteHeader } from "@/components/site-header";
import { getPlatformRole, listOpenReports, listOpenReviewReports } from "@/lib/admin";
import { getServerSession } from "@/lib/session";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; status?: string }> }) {
  await connection();
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const role = await getPlatformRole(session.user.id);
  if (!role) redirect("/");
  const query = await searchParams;
  const reportStatus = query.status === "actioned" || query.status === "dismissed" ? query.status : "open";
  const [reports, reviewReports] = await Promise.all([listOpenReports(reportStatus), listOpenReviewReports(reportStatus)]);
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
    <div className="flex-1 bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-9 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Moderación</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Cola de moderación</h1><p className="mt-2 text-sm text-muted-foreground">Rol: <span className="font-medium capitalize text-foreground">{role}</span>. Las decisiones quedan registradas en un historial inmutable.</p></div>
          <div className="flex flex-wrap gap-2"><Button asChild variant={reportStatus === "open" ? "default" : "outline"} size="sm"><a href="/admin">Pendientes</a></Button><Button asChild variant={reportStatus === "actioned" ? "default" : "outline"} size="sm"><a href="/admin?status=actioned">Resueltos</a></Button><Button asChild variant={reportStatus === "dismissed" ? "default" : "outline"} size="sm"><a href="/admin?status=dismissed">Descartados</a></Button></div>
        </header>
        {query.updated ? <Alert className="mt-5 border-success/30 bg-success/10"><CheckCircle2 aria-hidden="true" className="text-success" /><AlertDescription className="text-success">La acción se completó correctamente.</AlertDescription></Alert> : null}
        {query.error ? <Alert variant="destructive" className="mt-5"><AlertCircle aria-hidden="true" /><AlertDescription>{moderationErrorMessage}</AlertDescription></Alert> : null}

        <AdminModerationWorkbench items={moderationItems} status={reportStatus} serverAction={moderateReportAction} reviewAction={moderateReviewReportAction} />

        {role === "admin" ? <section className="mt-10" aria-labelledby="roles-heading"><Card><CardHeader><CardTitle id="roles-heading">Gestionar roles</CardTitle><CardDescription>Concede permisos de moderación a una cuenta existente.</CardDescription></CardHeader><CardContent><form action={grantRoleAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"><Field><FieldLabel htmlFor="role-email">Correo electrónico</FieldLabel><Input id="role-email" required type="email" name="email" placeholder="cuenta@ejemplo.com" /></Field><Field><FieldLabel htmlFor="role-value">Rol</FieldLabel><NativeSelect id="role-value" name="role"><option value="moderator">Moderador</option><option value="admin">Administrador</option></NativeSelect></Field><Button type="submit">Conceder rol</Button></form></CardContent></Card></section> : null}
      </main>
    </div>
  );
}
