import { Star } from "lucide-react";

import { deleteOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OfficialReplyEditor } from "@/components/official-reply-editor";
import { OfficialReplyForm } from "@/components/official-reply-form";
import { ReviewReportForm } from "@/components/review-report-form";
import type { ReviewView } from "@/lib/servers/reviews";
import { LocalizedTimestamp } from "@/components/localized-timestamp";

function Rating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-warning" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => <Star key={star} aria-hidden="true" className={`size-3.5 ${star <= rating ? "fill-current" : "opacity-25"}`} />)}
      <span className="ml-1 text-xs font-medium tabular-nums text-muted-foreground">{rating.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
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
    <Card id={`review-${review.id}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="size-8 shrink-0"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(review.authorName)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div>
                <p className="text-sm font-semibold">{review.authorName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground"><LocalizedTimestamp value={review.createdAt} mode="datetime" /></p>
              </div>
              <Rating rating={review.rating} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.content}</p>
          </div>
        </div>

        {review.reply ? (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-primary">Respuesta oficial</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{review.reply.authorName} · <LocalizedTimestamp value={review.reply.createdAt} mode="datetime" /></p>
              </div>
              {canManageReplies ? <div className="flex flex-wrap items-center gap-2"><OfficialReplyEditor replyId={review.reply.id} slug={slug} content={review.reply.content} /><form action={deleteOfficialReplyAction}><input type="hidden" name="replyId" value={review.reply.id} /><input type="hidden" name="slug" value={slug} /><Button type="submit" variant="link" size="sm" className="h-auto p-0 text-xs text-primary">Eliminar</Button></form></div> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.reply.content}</p>
          </div>
        ) : canReply ? <OfficialReplyForm reviewId={review.id} slug={slug} /> : null}

        {canReport ? <><Separator className="my-4" /><ReviewReportForm serverId={serverId} reviewId={review.id} /></> : null}
      </CardContent>
    </Card>
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
