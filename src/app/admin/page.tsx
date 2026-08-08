import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, Flag, MessageSquareWarning, Tag as TagIcon } from "lucide-react";

import { moderateReportAction, moderateReviewReportAction, moderateTagAction, grantRoleAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  const reportStatus = query.status === "actioned" ? "actioned" : "open";
  const [reports, reviewReports, tags] = await Promise.all([listOpenReports(reportStatus), listOpenReviewReports(reportStatus), listModerationTags()]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Moderación</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Cola de moderación</h1><p className="mt-2 text-sm text-muted-foreground">Rol: <span className="font-medium capitalize text-foreground">{role}</span>. Las decisiones quedan registradas en un historial inmutable.</p></div>
          <div className="flex gap-2"><Button asChild variant={reportStatus === "open" ? "default" : "outline"} size="sm"><a href="/admin">Abiertos</a></Button><Button asChild variant={reportStatus === "actioned" ? "default" : "outline"} size="sm"><a href="/admin?status=actioned">Resueltos</a></Button></div>
        </header>
        {query.updated ? <Alert className="mt-5 border-success/30 bg-success/10"><CheckCircle2 aria-hidden="true" className="text-success" /><AlertDescription className="text-success">La acción se completó correctamente.</AlertDescription></Alert> : null}
        {query.error ? <Alert variant="destructive" className="mt-5"><AlertCircle aria-hidden="true" /><AlertDescription>No se pudo completar la acción de moderación.</AlertDescription></Alert> : null}

        <section className="mt-8 grid gap-4" aria-labelledby="server-reports-heading">
          <div className="flex items-center gap-2"><Flag aria-hidden="true" className="size-5 text-primary" /><h2 id="server-reports-heading" className="text-xl font-semibold tracking-tight">Reportes de servidores</h2><Badge variant="secondary">{reports.length}</Badge></div>
          {reports.length === 0 ? <EmptyState> No hay reportes de servidores en esta vista.</EmptyState> : reports.map((report) => <ReportCard key={report.id} report={report} />)}
        </section>

        <section className="mt-10 grid gap-4" aria-labelledby="review-reports-heading">
          <div className="flex items-center gap-2"><MessageSquareWarning aria-hidden="true" className="size-5 text-primary" /><h2 id="review-reports-heading" className="text-xl font-semibold tracking-tight">Reportes de opiniones</h2><Badge variant="secondary">{reviewReports.length}</Badge></div>
          {reviewReports.length === 0 ? <EmptyState>No hay reportes de opiniones en esta vista.</EmptyState> : reviewReports.map((report) => <ReviewReportCard key={report.id} report={report} />)}
        </section>

        <section className="mt-10" aria-labelledby="tags-heading">
          <Card><CardHeader><div className="flex items-center gap-2"><TagIcon aria-hidden="true" className="size-5 text-primary" /><CardTitle id="tags-heading">Etiquetas</CardTitle></div><CardDescription>Revisa el uso y el estado de las etiquetas del catálogo.</CardDescription></CardHeader><CardContent>{tags.length ? <div className="divide-y rounded-md border">{tags.map((tag) => <div key={tag.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{tag.label}</p><p className="text-xs text-muted-foreground">{tag.usageCount} usos · <span className="capitalize">{tag.status}</span></p></div><div className="flex flex-wrap items-center gap-2"><form action={moderateTagAction}><input type="hidden" name="tagAction" value="block" /><input type="hidden" name="tagId" value={tag.id} /><Button type="submit" variant="outline" size="sm">Bloquear</Button></form><form action={moderateTagAction} className="flex items-center gap-2"><input type="hidden" name="tagAction" value="rename" /><input type="hidden" name="tagId" value={tag.id} /><Input name="label" placeholder="Nuevo nombre" className="h-8 w-32 text-xs" aria-label={`Nuevo nombre para ${tag.label}`} /><Button type="submit" variant="ghost" size="sm" className="h-8">Renombrar</Button></form></div></div>)}</div> : <EmptyState>No hay etiquetas para moderar.</EmptyState>}</CardContent></Card>
        </section>

        {role === "admin" ? <section className="mt-10" aria-labelledby="roles-heading"><Card><CardHeader><CardTitle id="roles-heading">Gestionar roles</CardTitle><CardDescription>Concede permisos de moderación a una cuenta existente.</CardDescription></CardHeader><CardContent><form action={grantRoleAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"><Field><FieldLabel htmlFor="role-email">Correo electrónico</FieldLabel><Input id="role-email" required type="email" name="email" placeholder="cuenta@ejemplo.com" /></Field><Field><FieldLabel htmlFor="role-value">Rol</FieldLabel><NativeSelect id="role-value" name="role"><option value="moderator">Moderador</option><option value="admin">Administrador</option></NativeSelect></Field><Button type="submit">Conceder rol</Button></form></CardContent></Card></section> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function ReportCard({ report }: { report: Awaited<ReturnType<typeof listOpenReports>>[number] }) {
  return <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">{report.serverName}</CardTitle><CardDescription>/{report.serverSlug} · {report.reason} · {report.createdAt.toLocaleString("es-ES")}</CardDescription></div><ModerationActions action={moderateReportAction} id={report.id} status={report.status} /></div></CardHeader>{report.details ? <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{report.details}</p></CardContent> : null}</Card>;
}

function ReviewReportCard({ report }: { report: Awaited<ReturnType<typeof listOpenReviewReports>>[number] }) {
  return <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">{report.serverName}</CardTitle><CardDescription>/{report.serverSlug} · {report.reason} · {report.createdAt.toLocaleString("es-ES")}</CardDescription><p className="mt-1 text-xs text-muted-foreground">Reportado por {report.reporterName ?? "Usuario anónimo"}</p></div><ModerationActions action={moderateReviewReportAction} id={report.id} status={report.status} extra={{ serverSlug: report.serverSlug }} /></div></CardHeader><CardContent className="grid gap-3">{report.reviewContent ? <blockquote className="border-l-2 pl-3 text-sm leading-6 text-muted-foreground">{report.reviewContent}</blockquote> : <p className="text-sm text-muted-foreground">La opinión ya no está disponible.</p>}{report.details ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{report.details}</p> : null}<div className="flex flex-wrap gap-3 text-xs">{report.reviewId ? <Button asChild variant="link" size="sm" className="h-auto p-0"><a href={`/servers/${report.serverSlug}#review-${report.reviewId}`}>Abrir servidor</a></Button> : null}{report.reviewRating ? <span className="text-muted-foreground">Puntuación: {report.reviewRating}/5</span> : null}</div></CardContent></Card>;
}

function ModerationActions({ action, id, status, extra }: { action: (formData: FormData) => void | Promise<void>; id: string; status: "open" | "actioned" | "dismissed"; extra?: Record<string, string> }) {
  const hidden = Object.entries(extra ?? {});
  if (status === "open") return <div className="flex flex-wrap gap-2"><ModerationForm action={action} id={id} decision="dismissed" extra={hidden} label="Descartar" variant="outline" /><ModerationForm action={action} id={id} decision="hidden" extra={hidden} label="Ocultar" variant="destructive" /></div>;
  return <ModerationForm action={action} id={id} decision="restored" extra={hidden} label="Restaurar" variant="outline" />;
}

function ModerationForm({ action, id, decision, extra, label, variant }: { action: (formData: FormData) => void | Promise<void>; id: string; decision: string; extra: [string, string][]; label: string; variant: "outline" | "destructive" }) {
  return <form action={action}>{<input type="hidden" name="reportId" value={id} />}<input type="hidden" name="decision" value={decision} />{extra.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<Button type="submit" size="sm" variant={variant}>{label}</Button></form>;
}
