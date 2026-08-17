"use client";

import { useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";

import { updateOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function SaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Guardando…" : "Guardar edición"}</Button>;
}

export function OfficialReplyEditor({ replyId, slug, content }: { replyId: string; slug: string; content: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil aria-hidden="true" />
          Editar respuesta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar respuesta oficial</DialogTitle>
          <DialogDescription>
            Actualiza el mensaje que verá la comunidad junto a esta opinión.
          </DialogDescription>
        </DialogHeader>
        <form action={updateOfficialReplyAction} className="grid gap-4">
          <input type="hidden" name="replyId" value={replyId} />
          <input type="hidden" name="slug" value={slug} />
          <label className="sr-only" htmlFor={`edit-reply-${replyId}`}>Editar respuesta oficial</label>
          <Textarea id={`edit-reply-${replyId}`} name="content" defaultValue={content} minLength={10} maxLength={2_000} required rows={5} />
          <div className="flex justify-end"><SaveButton /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
