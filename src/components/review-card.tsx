import { IconStarFilled } from "@tabler/icons-react";

import { deleteOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { OfficialReplyEditor } from "@/components/official-reply-editor";
import { OfficialReplyForm } from "@/components/official-reply-form";
import { ReviewReportForm } from "@/components/review-report-form";
import type { ReviewView } from "@/lib/servers/reviews";

function Rating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#f4aa00]" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => <IconStarFilled key={star} aria-hidden="true" size={13} className={star <= rating ? "opacity-100" : "opacity-25"} />)}
      <span className="ml-1 text-[11px] font-medium text-[#4b5667]">{rating.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      <span className="sr-only">{rating} de 5</span>
    </span>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
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
    <article id={`review-${review.id}`} className="ui-card p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#65c78d] text-[11px] font-semibold text-white">{initials(review.authorName)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div>
              <p className="text-[12px] font-semibold text-[#17202a]">{review.authorName}</p>
              <p className="mt-0.5 text-[10px] text-[#7b8796]">{review.createdAt.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</p>
            </div>
            <Rating rating={review.rating} />
          </div>
          <p className="mt-2.5 whitespace-pre-wrap text-[12px] leading-[1.55] text-[#344154]">{review.content}</p>
        </div>
      </div>

      {review.reply ? (
        <div className="mt-3 rounded-lg border border-[#dfe0ff] bg-[#f5f5ff] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[11px] font-semibold text-[#3b35bf]">Respuesta oficial</p><p className="mt-0.5 text-[10px] text-[#7b7ca3]">{review.reply.authorName} · {review.reply.createdAt.toLocaleDateString("es-ES")}</p></div>
            {canManageReplies ? <form action={deleteOfficialReplyAction}><input type="hidden" name="replyId" value={review.reply.id} /><input type="hidden" name="slug" value={slug} /><button type="submit" className="text-[10px] font-semibold text-[#4a45ba] underline underline-offset-4">Eliminar</button></form> : null}
          </div>
          <p className="mt-2 text-[12px] leading-[1.55] text-[#333572]">{review.reply.content}</p>
          {canManageReplies ? <OfficialReplyEditor replyId={review.reply.id} slug={slug} content={review.reply.content} /> : null}
        </div>
      ) : canReply ? <OfficialReplyForm reviewId={review.id} slug={slug} /> : null}

      {canReport ? <ReviewReportForm serverId={serverId} reviewId={review.id} /> : null}
    </article>
  );
}

export function DeletedReviewNotice({ status, content }: { status: "hidden" | "deleted"; content: string }) {
  return <div className="rounded-xl border border-[#f1d89d] bg-[#fff8e7] p-4 text-sm text-[#8a6200]"><p className="font-semibold">{status === "hidden" ? "Tu opinión está oculta por moderación" : "Has eliminado tu opinión"}</p><p className="mt-1 leading-6">{status === "hidden" ? "No aparece públicamente mientras se revisa el reporte." : "La valoración y el estado ya no se muestran públicamente."}</p>{status === "hidden" ? <p className="mt-3 whitespace-pre-wrap text-xs text-[#8a6200]/80">{content}</p> : null}</div>;
}
