import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReviewForm, type ReviewAction } from "@/components/review-form";

export function ReviewEditDialog({
  action,
  serverId,
  slug,
  reviewId,
  initialRating,
  initialContent,
}: {
  action: ReviewAction;
  serverId: string;
  slug: string;
  reviewId: string;
  initialRating: number;
  initialContent: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil aria-hidden="true" />
          Editar opinión
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar opinión</DialogTitle>
          <DialogDescription>
            Actualiza tu valoración y comentario sin salir de la página del servidor.
          </DialogDescription>
        </DialogHeader>
        <ReviewForm
          action={action}
          serverId={serverId}
          slug={slug}
          reviewId={reviewId}
          initialRating={initialRating}
          initialContent={initialContent}
          editing
        />
      </DialogContent>
    </Dialog>
  );
}
