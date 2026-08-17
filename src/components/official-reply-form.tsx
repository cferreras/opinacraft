"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MessageSquarePlus } from "lucide-react";

import type { ReviewActionState } from "@/app/servers/[slug]/actions";
import { createOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

function SubmitReplyButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Responder oficialmente"}</Button>;
}

export function OfficialReplyForm({ reviewId, slug }: { reviewId: string; slug: string }) {
  const [state, action] = useActionState<ReviewActionState | null, FormData>(createOfficialReplyAction, null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-4">
          <MessageSquarePlus aria-hidden="true" />
          Responder oficialmente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Responder oficialmente</DialogTitle>
          <DialogDescription>
            La respuesta aparecerá publicada junto a esta opinión.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="slug" value={slug} />
          <Field>
            <FieldLabel htmlFor={`reply-content-${reviewId}`}>Respuesta oficial</FieldLabel>
            <Textarea id={`reply-content-${reviewId}`} name="content" required minLength={10} maxLength={2_000} rows={5} placeholder="Responde en nombre del equipo del servidor." />
            <FieldDescription className="text-right">Máximo 2.000 caracteres</FieldDescription>
            <FieldError>{state?.fieldErrors?.content}</FieldError>
          </Field>
          {state?.formError ? <Alert variant="destructive"><AlertDescription>{state.formError}</AlertDescription></Alert> : null}
          <div className="flex justify-end"><SubmitReplyButton /></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
