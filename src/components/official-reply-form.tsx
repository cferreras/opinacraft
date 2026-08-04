"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ReviewActionState } from "@/app/servers/[slug]/actions";
import { createOfficialReplyAction } from "@/app/servers/[slug]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

function SubmitReplyButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Responder oficialmente"}</Button>;
}

export function OfficialReplyForm({ reviewId, slug }: { reviewId: string; slug: string }) {
  const [state, action] = useActionState<ReviewActionState | null, FormData>(createOfficialReplyAction, null);
  return (
    <form action={action} className="mt-4 grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="slug" value={slug} />
      <Field>
        <FieldLabel htmlFor={`reply-content-${reviewId}`}>Respuesta oficial</FieldLabel>
        <Textarea id={`reply-content-${reviewId}`} name="content" required minLength={10} maxLength={2_000} rows={3} placeholder="Responde en nombre del equipo del servidor." />
        <FieldDescription className="text-right">Máximo 2.000 caracteres</FieldDescription>
        <FieldError>{state?.fieldErrors?.content}</FieldError>
      </Field>
      {state?.formError ? <Alert variant="destructive"><AlertDescription>{state.formError}</AlertDescription></Alert> : null}
      <div className="flex justify-end"><SubmitReplyButton /></div>
    </form>
  );
}
