"use client";

import { useFormStatus } from "react-dom";

import { updateOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function SaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Guardando…" : "Guardar edición"}</Button>;
}

export function OfficialReplyEditor({ replyId, slug, content }: { replyId: string; slug: string; content: string }) {
  return (
    <form action={updateOfficialReplyAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="replyId" value={replyId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="sr-only" htmlFor={`edit-reply-${replyId}`}>Editar respuesta oficial</label>
      <Textarea id={`edit-reply-${replyId}`} name="content" defaultValue={content} minLength={10} maxLength={2_000} required rows={3} />
      <div className="flex items-start"><SaveButton /></div>
    </form>
  );
}
