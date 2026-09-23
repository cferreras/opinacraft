import { ShieldCheck, Star } from "lucide-react";

import { deleteOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OfficialReplyEditor } from "@/components/official-reply-editor";
import { OfficialReplyForm } from "@/components/official-reply-form";
import { ReviewReportForm } from "@/components/review-report-form";
import type { ReviewView } from "@/lib/servers/reviews";
import { LocalizedTimestamp } from "@/components/localized-timestamp";

function Rating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-px text-rating" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => <Star key={star} aria-hidden="true" className={`size-3.25 fill-current ${star <= rating ? "" : "text-muted-foreground/25"}`} />)}
    </span>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

export function ReviewCard({ review, serverId, slug, canReport, canReply, canManageReplies }: {
  review: ReviewView;
  serverId: string;
  slug: string;
  canReport: boolean;
  canReply: boolean;
  canManageReplies: boolean;
}) {
  return (
    <article id={`review-${review.id}`} className="scroll-mt-24 border-t p-5.25 first:border-t-0 sm:p-8.5">
      <div>
        <div className="flex items-center gap-3.25">
          <Avatar className="size-10 shrink-0"><AvatarImage src={review.authorImage ?? undefined} alt="" width={40} height={40} /><AvatarFallback className="bg-accent text-[0.9375rem] font-extrabold text-primary-ink">{initials(review.authorName)}</AvatarFallback></Avatar>
          <div className="grid min-w-0 gap-0.5">
            <p className="text-sm font-bold">{review.authorName}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Rating rating={review.rating} /><span aria-hidden="true">·</span><LocalizedTimestamp value={review.createdAt} mode="datetime" /></p>
          </div>
        </div>
        <p className="mt-3.25 max-w-[38rem] whitespace-pre-wrap text-[0.9375rem] leading-6 text-foreground/75">{review.content}</p>

        {review.reply ? (
          <div className="mt-3.25 rounded-lg bg-accent p-5.25 sm:ml-13.25">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-primary-ink">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                Respuesta oficial del equipo
                <span className="font-medium text-muted-foreground">· {review.reply.authorName} · <LocalizedTimestamp value={review.reply.createdAt} mode="datetime" /></span>
              </p>
              {canManageReplies ? <div className="flex flex-wrap items-center gap-2"><OfficialReplyEditor replyId={review.reply.id} slug={slug} content={review.reply.content} /><form action={deleteOfficialReplyAction}><input type="hidden" name="replyId" value={review.reply.id} /><input type="hidden" name="slug" value={slug} /><Button type="submit" variant="link" size="sm" className="h-auto p-0 text-xs text-primary">Eliminar</Button></form></div> : null}
            </div>
            <p className="mt-2 text-sm leading-[1.375rem] text-foreground/75">{review.reply.content}</p>
          </div>
        ) : canReply ? <OfficialReplyForm reviewId={review.id} slug={slug} /> : null}

        {canReport ? <><Separator className="my-4" /><ReviewReportForm serverId={serverId} reviewId={review.id} /></> : null}
      </div>
    </article>
  );
}

export function DeletedReviewNotice({ status, content }: { status: "hidden" | "deleted"; content: string }) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
      <p className="font-semibold">{status === "hidden" ? "Tu opinión está oculta por moderación" : "Has eliminado tu opinión"}</p>
      <p className="mt-1 leading-6">{status === "hidden" ? "No aparece públicamente mientras se revisa el reporte." : "La valoración y el estado ya no se muestran públicamente."}</p>
      {status === "hidden" ? <p className="mt-3 whitespace-pre-wrap text-xs opacity-80">{content}</p> : null}
    </div>
  );
}
