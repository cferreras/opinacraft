import { redirect } from "next/navigation";

import { grantRoleAction, moderateReportAction, moderateTagAction } from "@/app/admin/actions";
import { getPlatformRole, listOpenReports } from "@/lib/admin";
import { listModerationTags } from "@/lib/servers/tags";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; status?: string }> }) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/admin");
  const role = await getPlatformRole(session.user.id);
  if (!role) redirect("/");
  const query = await searchParams;
  const [reports, tags] = await Promise.all([listOpenReports(query.status === "actioned" ? "actioned" : "open"), listModerationTags()]);
  return <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950"><section className="mx-auto w-full max-w-5xl">
    <h1 className="text-3xl font-semibold tracking-tight">Cola de moderación</h1>
    <p className="mt-2 text-sm text-zinc-500">Rol: {role}. Las decisiones quedan registradas en un historial inmutable.</p>
    <div className="mt-4 flex gap-3 text-sm"><a href="/admin" className="underline">Abiertos</a><a href="/admin?status=actioned" className="underline">Resueltos</a></div>
    {query.updated ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Actualizado.</p> : null}
    {query.error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo completar la acción.</p> : null}
    <div className="mt-8 grid gap-4">{reports.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">No hay reportes en esta vista.</p> : reports.map((report) => <article key={report.id} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{report.serverName}</h2><p className="text-xs text-zinc-500">/{report.serverSlug} · {report.reason} · {report.createdAt.toLocaleString("es-ES")}</p></div><div className="flex gap-2">{report.status === "open" ? <><form action={moderateReportAction}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="dismissed" /><button className="rounded-lg border border-zinc-300 px-3 py-2 text-xs">Descartar</button></form><form action={moderateReportAction}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="hidden" /><button className="rounded-lg bg-red-700 px-3 py-2 text-xs text-white">Ocultar ficha</button></form></> : <form action={moderateReportAction}><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="decision" value="restored" /><button className="rounded-lg border border-zinc-300 px-3 py-2 text-xs">Restaurar</button></form>}</div></div>{report.details ? <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-600">{report.details}</p> : null}</article>)}</div>
    <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Etiquetas</h2><div className="mt-4 grid gap-2">{tags.map((tag) => <div key={tag.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-2 text-sm dark:border-zinc-800"><span>{tag.label} <span className="text-xs text-zinc-500">({tag.usageCount}) · {tag.status}</span></span><div className="flex gap-2"><form action={moderateTagAction}><input type="hidden" name="tagAction" value="block" /><input type="hidden" name="tagId" value={tag.id} /><button className="text-xs underline">Bloquear</button></form><form action={moderateTagAction}><input type="hidden" name="tagAction" value="rename" /><input type="hidden" name="tagId" value={tag.id} /><input name="label" placeholder="Nuevo nombre" className="h-7 w-32 rounded border px-2 text-xs" /><button className="text-xs underline">Renombrar</button></form></div></div>)}</div></section>
    {role === "admin" ? <section className="mt-10 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Gestionar roles</h2><form action={grantRoleAction} className="mt-3 flex flex-wrap gap-2"><input required type="email" name="email" placeholder="cuenta@ejemplo.com" className="h-9 rounded border px-2 text-sm" /><select name="role" className="h-9 rounded border px-2 text-sm"><option value="moderator">Moderador</option><option value="admin">Administrador</option></select><button className="h-9 rounded bg-zinc-950 px-3 text-sm text-white">Conceder</button></form></section> : null}
  </section></main>;
}
