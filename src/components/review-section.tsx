import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import { createReviewAction, deleteReviewAction, updateReviewAction } from "@/app/servers/[slug]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { DeletedReviewNotice, ReviewCard } from "@/components/review-card";
import { ReviewEditDialog } from "@/components/review-edit-dialog";
import { ReviewForm } from "@/components/review-form";
import { canPublishOfficialReply, REVIEW_PAGE_SIZE, type ReviewSummary, type ReviewView } from "@/lib/servers/reviews";

type ViewerState = {
  emailVerified: boolean;
  membershipRole: "owner" | "admin" | "editor" | null;
  review: { id: string; rating: number; content: string; status: "published" | "hidden" | "deleted"; createdAt: Date; updatedAt: Date } | null;
};

function RatingStars({ rating, size = "size-3.5" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-rating" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => <Star key={star} aria-hidden="true" className={`${size} fill-current ${star <= Math.round(rating) ? "" : "text-muted-foreground/25"}`} />)}
    </span>
  );
}

function Summary({ summary }: { summary: ReviewSummary }) {
  const total = Math.max(summary.total, 1);
  const averageLabel = summary.average === null ? "—" : summary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    // 1 : φ -- the score block and the distribution split the row by the golden ratio.
    <div className="grid grid-cols-[5.5625rem_minmax(0,1fr)] items-center gap-5.25 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.618fr)] sm:gap-8.5">
      <div className="grid gap-1.25">
        <p className="sr-only">Valoración media</p>
        <p className="text-[2.625rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums sm:text-[4.25rem]">{averageLabel}</p>
        <span className="max-sm:hidden"><RatingStars rating={summary.average ?? 0} size="size-4.5" /></span>
        <p className="text-[0.8125rem] text-muted-foreground tabular-nums">{summary.total} {summary.total === 1 ? "opinión" : "opiniones"}</p>
      </div>
      <div className="grid gap-1.25 sm:gap-2" aria-label="Distribución de puntuaciones">
        {[5, 4, 3, 2, 1].map((rating) => {
          const share = Math.round((summary.distribution[rating - 1] / total) * 100);
          return <div key={rating} className="grid grid-cols-[0.8125rem_minmax(0,1fr)] items-center gap-2 text-xs sm:grid-cols-[0.8125rem_minmax(0,1fr)_2.125rem] sm:gap-3.25 sm:text-[0.8125rem] text-muted-foreground tabular-nums"><span className="font-bold text-foreground">{rating}</span><div className="h-1.5 overflow-hidden rounded-full bg-muted sm:h-2"><div className="h-full rounded-full bg-rating" style={{ width: `${share}%` }} /></div><span className="text-right max-sm:hidden">{share}%</span></div>;
        })}
      </div>
    </div>
  );
}

// Guests have no composer: the header action sends them to sign in.
function Composer({ serverId, slug, viewer }: { serverId: string; slug: string; viewer: ViewerState }) {
  if (!viewer.emailVerified) return <Alert><AlertDescription><strong>Verifica tu email para opinar.</strong> Puedes reenviar el enlace desde tu perfil. <Button asChild variant="link" size="sm" className="h-auto p-0"><Link href="/profile">Ir al perfil</Link></Button></AlertDescription></Alert>;
  if (viewer.membershipRole) return <Alert><AlertDescription><strong>Formas parte del equipo.</strong> Los miembros no pueden puntuar su propio servidor.</AlertDescription></Alert>;
  if (viewer.review?.status === "hidden") return <DeletedReviewNotice status="hidden" content={viewer.review.content} />;
  if (viewer.review?.status === "deleted") return <Card><CardContent className="grid gap-4 p-4"><DeletedReviewNotice status="deleted" content={viewer.review.content} /><ReviewForm action={createReviewAction} serverId={serverId} slug={slug} /></CardContent></Card>;
  if (viewer.review) return <Card><CardContent className="grid gap-4 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Tu opinión está publicada</p><p className="mt-1 text-xs text-muted-foreground">Puedes actualizarla cuando quieras.</p></div><div className="flex flex-wrap items-center gap-2"><ReviewEditDialog action={updateReviewAction} serverId={serverId} slug={slug} reviewId={viewer.review.id} initialRating={viewer.review.rating} initialContent={viewer.review.content} /><form action={deleteReviewAction}><input type="hidden" name="reviewId" value={viewer.review.id} /><input type="hidden" name="slug" value={slug} /><Button type="submit" variant="link" size="sm" className="h-auto p-0 text-destructive">Eliminar opinión</Button></form></div></div></CardContent></Card>;
  return <Card><CardContent className="grid gap-4 p-4"><p className="text-sm font-semibold">Comparte tu experiencia</p><ReviewForm action={createReviewAction} serverId={serverId} slug={slug} /></CardContent></Card>;
}

export function ReviewSection({ serverId, slug, summary, reviews, page, hasNextPage, viewer, notice, errorNotice }: {
  serverId: string;
  slug: string;
  summary: ReviewSummary;
  reviews: ReviewView[];
  page: number;
  hasNextPage: boolean;
  viewer: ViewerState | null;
  notice?: string;
  errorNotice?: string;
}) {
  const canReply = canPublishOfficialReply(viewer?.membershipRole ?? null);
  const canReport = Boolean(viewer?.emailVerified);
  // The header action only shows when this viewer can actually write; a guest goes straight to sign-in.
  const canWrite = !viewer || (viewer.emailVerified && !viewer.membershipRole && (!viewer.review || viewer.review.status === "deleted"));
  const writeHref = viewer ? "#review-composer" : `/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}#reviews`)}`;
  const firstShown = (page - 1) * REVIEW_PAGE_SIZE + 1;
  return (
    <Card id="reviews" className="scroll-mt-24 gap-0 py-0">
      <div className="grid gap-5.25 border-b p-5.25 sm:gap-8.5 sm:p-8.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2" className="text-lg font-extrabold tracking-tight sm:text-xl">Opiniones de jugadores</CardTitle>
          {canWrite ? <Button asChild className="h-10 bg-foreground px-4 font-bold text-background hover:bg-foreground/90 max-sm:hidden"><Link href={writeHref}>Escribir una opinión</Link></Button> : null}
        </div>
        {notice ? <Alert><AlertDescription>{notice}</AlertDescription></Alert> : null}
        {errorNotice ? <Alert variant="destructive"><AlertDescription>{errorNotice}</AlertDescription></Alert> : null}
        <Summary summary={summary} />
        {/* On phones the action drops under the score as a full-width outline button. */}
        {canWrite ? <Button asChild variant="outline" className="h-11 border-foreground font-bold sm:hidden"><Link href={writeHref}>Escribir una opinión</Link></Button> : null}
        {viewer ? <div id="review-composer" className="scroll-mt-24"><Composer serverId={serverId} slug={slug} viewer={viewer} /></div> : null}
      </div>
      {reviews.length ? (
        <div className="grid">{reviews.map((review) => <ReviewCard key={review.id} review={review} serverId={serverId} slug={slug} canReport={canReport && !review.isMine} canReply={canReply} canManageReplies={canReply} />)}</div>
      ) : (
        <p className="p-8.5 text-center text-sm text-muted-foreground">Todavía no hay opiniones. Sé el primero en contar tu experiencia.</p>
      )}
      {reviews.length ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t px-5.25 py-5.25 text-[0.8125rem] text-muted-foreground sm:px-8.5" aria-label="Páginas de opiniones">
          <span className="tabular-nums">Mostrando {firstShown}–{firstShown + reviews.length - 1} de {summary.total}</span>
          <div className="flex gap-2">
            {page > 1 ? <Button asChild variant="outline" className="h-9 font-bold"><Link href={`/servers/${slug}?reviewPage=${page - 1}#reviews`}><ChevronLeft aria-hidden="true" />Anteriores</Link></Button> : null}
            {hasNextPage ? <Button asChild variant="outline" className="h-9 font-bold text-foreground"><Link href={`/servers/${slug}?reviewPage=${page + 1}#reviews`}>Ver más opiniones<ChevronRight aria-hidden="true" /></Link></Button> : null}
          </div>
        </nav>
      ) : null}
    </Card>
  );
}
