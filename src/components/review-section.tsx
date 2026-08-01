import Link from "next/link";

import { createReviewAction, deleteReviewAction, updateReviewAction } from "@/app/servers/[slug]/actions";
import { DeletedReviewNotice, ReviewCard } from "@/components/review-card";
import { ReviewForm } from "@/components/review-form";
import { canPublishOfficialReply, type ReviewSummary, type ReviewView } from "@/lib/servers/reviews";

type ViewerState = {
  emailVerified: boolean;
  membershipRole: "owner" | "admin" | "editor" | null;
  review: { id: string; rating: number; content: string; status: "published" | "hidden" | "deleted"; createdAt: Date; updatedAt: Date } | null;
};

function Summary({ summary }: { summary: ReviewSummary }) {
  const maximum = Math.max(...summary.distribution, 1);
  const averageLabel = summary.average === null ? "—" : summary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return <div className="grid gap-6 border-y border-zinc-200 py-6 sm:grid-cols-[180px_1fr] dark:border-zinc-800">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Puntuación media</p><p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-white">{averageLabel}</p><p className="mt-1 text-sm text-zinc-500">{summary.total === 1 ? "1 opinión" : `${summary.total} opiniones`}</p></div>
    <div className="space-y-2 self-center" aria-label="Distribución de puntuaciones">
      {[5, 4, 3, 2, 1].map((rating) => { const count = summary.distribution[rating - 1]; const width = `${Math.round((count / maximum) * 100)}%`; return <div key={rating} className="grid grid-cols-[46px_1fr_30px] items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400"><span>{rating} estrellas</span><div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-amber-500" style={{ width }} /></div><span className="text-right tabular-nums">{count}</span></div>; })}
    </div>
  </div>;
}

function Composer({ serverId, slug, viewer }: { serverId: string; slug: string; viewer: ViewerState | null }) {
  if (!viewer) return <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950/60 dark:text-zinc-400"><p className="font-semibold text-zinc-900 dark:text-zinc-100">¿Has jugado en este servidor?</p><p className="mt-1">Inicia sesión con una cuenta verificada para compartir tu experiencia.</p><Link href={`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}#reviews`)}`} className="mt-3 inline-flex font-semibold text-zinc-950 underline underline-offset-4 dark:text-white">Iniciar sesión</Link></div>;
  if (!viewer.emailVerified) return <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Verifica tu email para opinar.</p><p className="mt-1">Puedes reenviar el enlace desde tu perfil.</p><Link href="/profile" className="mt-3 inline-flex font-semibold underline underline-offset-4">Ir al perfil</Link></div>;
  if (viewer.membershipRole) return <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950/60 dark:text-zinc-400"><p className="font-semibold text-zinc-900 dark:text-zinc-100">Formas parte del equipo</p><p className="mt-1">Los miembros no pueden puntuar su propio servidor.</p></div>;
  if (viewer.review?.status === "hidden" || viewer.review?.status === "deleted") return <DeletedReviewNotice status={viewer.review.status} content={viewer.review.content} />;
  if (viewer.review) return <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"><p className="mb-4 text-sm font-semibold text-zinc-950 dark:text-white">Edita tu opinión</p><ReviewForm action={updateReviewAction} serverId={serverId} slug={slug} reviewId={viewer.review.id} initialRating={viewer.review.rating} initialContent={viewer.review.content} editing /><form action={deleteReviewAction} className="mt-3 flex justify-end"><input type="hidden" name="reviewId" value={viewer.review.id} /><input type="hidden" name="slug" value={slug} /><button type="submit" className="text-xs font-semibold text-red-700 underline decoration-red-300 underline-offset-4 dark:text-red-300">Eliminar opinión</button></form></div>;
  return <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"><p className="mb-4 text-sm font-semibold text-zinc-950 dark:text-white">Comparte tu experiencia</p><ReviewForm action={createReviewAction} serverId={serverId} slug={slug} /></div>;
}

export function ReviewSection({ serverId, slug, summary, reviews, page, hasNextPage, viewer, notice, errorNotice }: { serverId: string; slug: string; summary: ReviewSummary; reviews: ReviewView[]; page: number; hasNextPage: boolean; viewer: ViewerState | null; notice?: string; errorNotice?: string }) {
  const canReply = canPublishOfficialReply(viewer?.membershipRole ?? null);
  const canReport = Boolean(viewer?.emailVerified);
  const canManageReplies = canReply;
  return <section id="reviews" className="mt-12 scroll-mt-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Experiencias de la comunidad</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Opiniones del servidor</h2></div>{notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">{notice}</p> : null}</div>
    {errorNotice ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">{errorNotice}</p> : null}
    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Valoraciones de jugadores y respuestas oficiales del equipo. Las opiniones ocultas no forman parte de la puntuación.</p>
    <div className="mt-6"><Summary summary={summary} /></div>
    <div className="mt-6"><Composer serverId={serverId} slug={slug} viewer={viewer} /></div>
    <div className="mt-6 grid gap-4">{reviews.length ? reviews.map((review) => <ReviewCard key={review.id} review={review} serverId={serverId} slug={slug} canReport={canReport && !review.isMine} canReply={canReply} canManageReplies={canManageReplies} />) : <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">Todavía no hay opiniones. Sé el primero en contar tu experiencia.</div>}</div>
    {(page > 1 || hasNextPage) ? <nav className="mt-6 flex items-center justify-between" aria-label="Páginas de opiniones">{page > 1 ? <Link href={`/servers/${slug}?reviewPage=${page - 1}#reviews`} className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Anteriores</Link> : <span />}{hasNextPage ? <Link href={`/servers/${slug}?reviewPage=${page + 1}#reviews`} className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Más recientes</Link> : null}</nav> : null}
  </section>;
}
