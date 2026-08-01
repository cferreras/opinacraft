import { deleteOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { OfficialReplyEditor } from "@/components/official-reply-editor";
import { OfficialReplyForm } from "@/components/official-reply-form";
import { ReviewReportForm } from "@/components/review-report-form";
import type { ReviewView } from "@/lib/servers/reviews";

function Rating({ rating }: { rating: number }) {
  return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300" aria-label={`${rating} de 5 estrellas`}><span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span><span className="sr-only">{rating} de 5</span></span>;
}

export function ReviewCard({
  review,
  serverId,
  slug,
  canReport,
  canReply,
  canManageReplies,
}: {
  review: ReviewView;
  serverId: string;
  slug: string;
  canReport: boolean;
  canReply: boolean;
  canManageReplies: boolean;
}) {
  return (
    <article id={`review-${review.id}`} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
            <span>{review.authorName}</span>
            {review.isMine ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Tu opinión</span> : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500">{review.createdAt.toLocaleDateString("es-ES")}</p>
        </div>
        <Rating rating={review.rating} />
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{review.content}</p>

      {review.reply ? (
        <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/70 dark:bg-indigo-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800 dark:text-indigo-200">Respuesta oficial</p><p className="mt-1 text-xs text-indigo-900/70 dark:text-indigo-100/70">{review.reply.authorName} · {review.reply.createdAt.toLocaleDateString("es-ES")}</p></div>
            {canManageReplies ? <form action={deleteOfficialReplyAction}><input type="hidden" name="replyId" value={review.reply.id} /><input type="hidden" name="slug" value={slug} /><button type="submit" className="text-xs font-semibold text-indigo-900 underline decoration-indigo-300 underline-offset-4 dark:text-indigo-100">Eliminar</button></form> : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-indigo-950 dark:text-indigo-50">{review.reply.content}</p>
          {canManageReplies ? <OfficialReplyEditor replyId={review.reply.id} slug={slug} content={review.reply.content} /> : null}
        </div>
      ) : canReply ? <OfficialReplyForm reviewId={review.id} slug={slug} /> : null}

      {canReport ? <ReviewReportForm serverId={serverId} reviewId={review.id} /> : null}
    </article>
  );
}

export function DeletedReviewNotice({ status, content }: { status: "hidden" | "deleted"; content: string }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">{status === "hidden" ? "Tu opinión está oculta por moderación" : "Has eliminado tu opinión"}</p><p className="mt-1 leading-6">{status === "hidden" ? "No aparece públicamente mientras se revisa el reporte." : "La valoración y el estado ya no se muestran públicamente."}</p>{status === "hidden" ? <p className="mt-3 whitespace-pre-wrap text-xs text-amber-900/80 dark:text-amber-100/80">{content}</p> : null}</div>;
}
