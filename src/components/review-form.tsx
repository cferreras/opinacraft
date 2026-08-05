"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Star } from "lucide-react";

import type { ReviewActionState } from "@/app/servers/[slug]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type ReviewAction = (previousState: ReviewActionState | null, formData: FormData) => Promise<ReviewActionState | null>;

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Publicar opinión"}</Button>;
}

export function ReviewForm({
  action,
  serverId,
  slug,
  reviewId,
  initialRating = 5,
  initialContent = "",
  editing = false,
}: {
  action: ReviewAction;
  serverId: string;
  slug: string;
  reviewId?: string;
  initialRating?: number;
  initialContent?: string;
  editing?: boolean;
}) {
  const [state, formAction] = useActionState<ReviewActionState | null, FormData>(action, null);
  const [rating, setRating] = useState(String(initialRating));
  const [content, setContent] = useState(initialContent);
  const contentId = editing ? `review-content-${reviewId}` : "review-content-new";

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="serverId" value={serverId} />
      <input type="hidden" name="slug" value={slug} />
      {reviewId ? <input type="hidden" name="reviewId" value={reviewId} /> : null}

      <Field>
        <FieldLabel>Tu puntuación</FieldLabel>
        <FieldDescription>Elige de 1 (muy mala) a 5 (excelente).</FieldDescription>
        <RadioGroup name="rating" value={rating} onValueChange={setRating} className="flex flex-wrap gap-2" aria-label="Puntuación de 1 a 5">
          {[1, 2, 3, 4, 5].map((value) => (
            <div key={value} className="relative">
              <RadioGroupItem value={String(value)} id={`rating-${reviewId ?? "new"}-${value}`} className="peer sr-only" />
              <label htmlFor={`rating-${reviewId ?? "new"}-${value}`} className="flex min-h-11 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input px-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:text-primary">
                <Star className={`size-4 ${value <= Number(rating) ? "fill-current text-warning" : "text-muted-foreground/40"}`} aria-hidden="true" />
                <span>{value}</span>
              </label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground" aria-live="polite">Puntuación: {rating} de 5</p>
        <FieldError>{state?.fieldErrors?.rating}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor={contentId}>Comentario</FieldLabel>
        <Textarea id={contentId} name="content" value={content} onChange={(event) => setContent(event.target.value)} minLength={10} maxLength={2_000} required aria-invalid={Boolean(state?.fieldErrors?.content)} aria-describedby={`${contentId}-count`} placeholder="Cuenta cómo fue tu experiencia en esta comunidad." rows={5} />
        <FieldDescription id={`${contentId}-count`} className="text-right tabular-nums">{content.length.toLocaleString("es-ES")} / 2.000</FieldDescription>
        <FieldError>{state?.fieldErrors?.content}</FieldError>
      </Field>

      {state?.formError ? <Alert variant="destructive"><AlertDescription>{state.formError}</AlertDescription></Alert> : null}
      <div className="flex justify-end"><SubmitButton editing={editing} /></div>
    </form>
  );
}
