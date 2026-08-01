import Link from "next/link";
import { IconStarFilled } from "@tabler/icons-react";

import { createReviewAction, deleteReviewAction, updateReviewAction } from "@/app/servers/[slug]/actions";
import { DeletedReviewNotice, ReviewCard } from "@/components/review-card";
import { ReviewForm } from "@/components/review-form";
import { canPublishOfficialReply, type ReviewSummary, type ReviewView } from "@/lib/servers/reviews";

type ViewerState = {
  emailVerified: boolean;
  membershipRole: "owner" | "admin" | "editor" | null;
  review: { id: string; rating: number; content: string; status: "published" | "hidden" | "deleted"; createdAt: Date; updatedAt: Date } | null;
};

function RatingStars({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#f4aa00]" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <IconStarFilled key={star} aria-hidden="true" size={size} className={star <= Math.round(rating) ? "opacity-100" : "opacity-25"} />
      ))}
      <span className="sr-only">{rating} de 5</span>
    </span>
  );
}

function Summary({ summary }: { summary: ReviewSummary }) {
  const maximum = Math.max(...summary.distribution, 1);
  const averageLabel = summary.average === null
    ? "—"
    : summary.average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="grid gap-5 border-y border-[#e7ebef] py-5 sm:grid-cols-[154px_1fr] sm:gap-7">
      <div>
        <p className="text-[11px] font-medium text-[#6a7484]">Valoración media</p>
        <p className="mt-1 text-[38px] font-semibold leading-none tracking-[-0.045em] text-[#101722]">{averageLabel}</p>
        <div className="mt-2 flex items-center gap-2">
          <RatingStars rating={summary.average ?? 0} size={14} />
          <span className="text-[11px] text-[#687386]">{summary.total} {summary.total === 1 ? "opinión" : "opiniones"}</span>
        </div>
      </div>
      <div className="space-y-2 self-center" aria-label="Distribución de puntuaciones">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = summary.distribution[rating - 1];
          const width = `${Math.round((count / maximum) * 100)}%`;
          return (
            <div key={rating} className="grid grid-cols-[18px_1fr_26px] items-center gap-2 text-[11px] text-[#687386]">
              <span>{rating}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#edf0f3]"><div className="h-full rounded-full bg-[#f5aa00]" style={{ width }} /></div>
              <span className="text-right tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Composer({ serverId, slug, viewer }: { serverId: string; slug: string; viewer: ViewerState | null }) {
  if (!viewer) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[#e2e7ec] bg-[#fbfcff] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#182033] text-xs font-semibold text-white">N</span>
          <div>
            <p className="text-[12px] font-medium text-[#43506a]">Comparte tu opinión sobre este servidor...</p>
            <p className="mt-0.5 text-[11px] text-[#8490a3]">Necesitas iniciar sesión para publicar.</p>
          </div>
        </div>
        <Link href={`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}#reviews`)}`} className="inline-flex h-8 items-center justify-center rounded-md bg-[#a7a7ff] px-3.5 text-[11px] font-semibold text-white transition hover:bg-[#8f8ff4] sm:shrink-0">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (!viewer.emailVerified) {
    return <div className="rounded-xl bg-[#fff8e7] p-4 text-sm text-[#8a6200]"><p className="font-semibold">Verifica tu email para opinar.</p><p className="mt-1 text-[12px]">Puedes reenviar el enlace desde tu perfil.</p><Link href="/profile" className="mt-3 inline-flex font-semibold underline underline-offset-4">Ir al perfil</Link></div>;
  }

  if (viewer.membershipRole) {
    return <div className="rounded-xl bg-[#f4f6f8] p-4 text-sm text-[#647080]"><p className="font-semibold text-[#17202a]">Formas parte del equipo</p><p className="mt-1 text-[12px]">Los miembros no pueden puntuar su propio servidor.</p></div>;
  }

  if (viewer.review?.status === "hidden") return <DeletedReviewNotice status="hidden" content={viewer.review.content} />;

  if (viewer.review?.status === "deleted") {
    return (
      <div className="space-y-4">
        <DeletedReviewNotice status="deleted" content={viewer.review.content} />
        <div className="rounded-xl border border-[#e2e7ec] bg-[#fbfcff] p-4">
          <p className="mb-4 text-sm font-semibold text-[#17202a]">Publica una nueva opinión</p>
          <ReviewForm action={createReviewAction} serverId={serverId} slug={slug} />
        </div>
      </div>
    );
  }

  if (viewer.review) {
    return (
      <div className="rounded-xl border border-[#e2e7ec] bg-[#fbfcff] p-4">
        <p className="mb-4 text-sm font-semibold text-[#17202a]">Edita tu opinión</p>
        <ReviewForm action={updateReviewAction} serverId={serverId} slug={slug} reviewId={viewer.review.id} initialRating={viewer.review.rating} initialContent={viewer.review.content} editing />
        <form action={deleteReviewAction} className="mt-3 flex justify-end"><input type="hidden" name="reviewId" value={viewer.review.id} /><input type="hidden" name="slug" value={slug} /><button type="submit" className="text-xs font-semibold text-red-700 underline decoration-red-300 underline-offset-4">Eliminar opinión</button></form>
      </div>
    );
  }

  return <div className="rounded-xl border border-[#e2e7ec] bg-[#fbfcff] p-4"><p className="mb-4 text-sm font-semibold text-[#17202a]">Comparte tu experiencia</p><ReviewForm action={createReviewAction} serverId={serverId} slug={slug} /></div>;
}

export function ReviewSection({
  serverId,
  slug,
  summary,
  reviews,
  page,
  hasNextPage,
  viewer,
  notice,
  errorNotice,
}: {
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
    <section id="reviews" className="mt-4 scroll-mt-8 rounded-2xl border border-[#e0e6eb] bg-white p-4 shadow-[0_1px_2px_rgba(16,30,45,0.02)] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#7a8595]">La voz de la comunidad</p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Opiniones de jugadores</h2>
        </div>
        {notice ? <p className="rounded-md bg-[#eaf9f0] px-3 py-2 text-xs text-[#147644]" role="status">{notice}</p> : null}
      </div>
      {errorNotice ? <p className="mt-4 rounded-md bg-[#fff1f1] px-3 py-2 text-sm text-[#a22929]" role="alert">{errorNotice}</p> : null}
      <div className="mt-4"><Summary summary={summary} /></div>
      <div className="mt-4"><Composer serverId={serverId} slug={slug} viewer={viewer} /></div>
      <div className="mt-4 grid gap-2.5">
        {reviews.length ? reviews.map((review) => <ReviewCard key={review.id} review={review} serverId={serverId} slug={slug} canReport={canReport && !review.isMine} canReply={canReply} canManageReplies={canReply} />) : <div className="rounded-xl border border-dashed border-[#ccd5dd] p-8 text-center text-sm text-[#718092]">Todavía no hay opiniones. Sé el primero en contar tu experiencia.</div>}
      </div>
      {(page > 1 || hasNextPage) ? (
        <nav className="mt-5 flex items-center justify-between" aria-label="Páginas de opiniones">
          {page > 1 ? <Link href={`/servers/${slug}?reviewPage=${page - 1}#reviews`} className="inline-flex min-h-9 items-center rounded-md border border-[#d7dfe6] px-3 text-xs font-semibold text-[#42506a]">Página anterior</Link> : <span />}
          {hasNextPage ? <Link href={`/servers/${slug}?reviewPage=${page + 1}#reviews`} className="inline-flex min-h-9 items-center rounded-md border border-[#d7dfe6] px-3 text-xs font-semibold text-[#42506a]">Página siguiente</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
