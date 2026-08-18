import Link from "next/link";
import { Star } from "lucide-react";

import { createReviewAction, deleteReviewAction, updateReviewAction } from "@/app/servers/[slug]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DeletedReviewNotice, ReviewCard } from "@/components/review-card";
import { ReviewEditDialog } from "@/components/review-edit-dialog";
import { ReviewForm } from "@/components/review-form";
import { canPublishOfficialReply, type ReviewSummary, type ReviewView } from "@/lib/servers/reviews";

type ViewerState = {
  emailVerified: boolean;
  membershipRole: "owner" | "admin" | "editor" | null;
  review: { id: string; rating: number; content: string; status: "published" | "hidden" | "deleted"; createdAt: Date; updatedAt: Date } | null;
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-warning" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => <Star key={star} aria-hidden="true" className={`size-3.5 ${star <= Math.round(rating) ? "fill-current" : "opacity-25"}`} />)}
    </span>
  );
}

function Summary({ summary }: { summary: ReviewSummary }) {
  const maximum = Math.max(...summary.distribution, 1);
  const averageLabel = summary.average === null ? "—" : summary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div className="grid gap-5 sm:grid-cols-[9.625rem_1fr] sm:gap-7">
      <div>
        <p className="text-sm text-muted-foreground">Valoración media</p>
        <p className="mt-1 text-4xl font-semibold leading-none tracking-tight tabular-nums">{averageLabel}</p>
        <div className="mt-2 flex items-center gap-2"><RatingStars rating={summary.average ?? 0} /><span className="text-xs text-muted-foreground">{summary.total} {summary.total === 1 ? "opinión" : "opiniones"}</span></div>
      </div>
      <div className="space-y-2 self-center" aria-label="Distribución de puntuaciones">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = summary.distribution[rating - 1];
          return <div key={rating} className="grid grid-cols-[1.125rem_1fr_1.625rem] items-center gap-2 text-xs text-muted-foreground"><span>{rating}</span><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-warning" style={{ width: `${Math.round((count / maximum) * 100)}%` }} /></div><span className="text-right tabular-nums">{count}</span></div>;
        })}
      </div>
    </div>
  );
}

function Composer({ serverId, slug, viewer }: { serverId: string; slug: string; viewer: ViewerState | null }) {
  if (!viewer) {
    return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Comparte tu opinión sobre este servidor</p><p className="mt-1 text-xs text-muted-foreground">Necesitas iniciar sesión para publicar.</p></div><Button asChild size="lg"><Link href={`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}#reviews`)}`}>Iniciar sesión</Link></Button></CardContent></Card>;
  }
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
  return (
    <Card id="reviews" className="mt-4 scroll-mt-8">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.08em] text-primary">La voz de la comunidad</p><CardTitle className="mt-1">Opiniones de jugadores</CardTitle></div>{notice ? <Alert className="w-auto py-2"><AlertDescription>{notice}</AlertDescription></Alert> : null}</CardHeader>
      <CardContent className="grid gap-4">
        {errorNotice ? <Alert variant="destructive"><AlertDescription>{errorNotice}</AlertDescription></Alert> : null}
        <Summary summary={summary} />
        <Separator />
        <Composer serverId={serverId} slug={slug} viewer={viewer} />
        <div className="grid gap-3">{reviews.length ? reviews.map((review) => <ReviewCard key={review.id} review={review} serverId={serverId} slug={slug} canReport={canReport && !review.isMine} canReply={canReply} canManageReplies={canReply} />) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Todavía no hay opiniones. Sé el primero en contar tu experiencia.</div>}</div>
        {(page > 1 || hasNextPage) ? <nav className="flex items-center justify-between" aria-label="Páginas de opiniones">{page > 1 ? <Button asChild variant="outline" size="sm"><Link href={`/servers/${slug}?reviewPage=${page - 1}#reviews`}>Página anterior</Link></Button> : <span />}{hasNextPage ? <Button asChild variant="outline" size="sm"><Link href={`/servers/${slug}?reviewPage=${page + 1}#reviews`}>Página siguiente</Link></Button> : null}</nav> : null}
      </CardContent>
    </Card>
  );
}
