"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { ReviewActionState } from "@/app/servers/[slug]/actions";

type ReviewAction = (
  previousState: ReviewActionState | null,
  formData: FormData,
) => Promise<ReviewActionState | null>;

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus-visible:ring-white dark:focus-visible:ring-offset-zinc-900"
    >
      {pending ? "Guardando…" : editing ? "Guardar cambios" : "Publicar opinión"}
    </button>
  );
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
  const [rating, setRating] = useState(initialRating);
  const [content, setContent] = useState(initialContent);
  const ratingLabelId = reviewId ? `review-rating-label-${reviewId}` : "review-rating-label-new";
  const ratingHelpId = reviewId ? `review-rating-help-${reviewId}` : "review-rating-help-new";
  const ratingErrorId = reviewId ? `review-rating-error-${reviewId}` : "review-rating-error-new";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="serverId" value={serverId} />
      <input type="hidden" name="slug" value={slug} />
      {reviewId ? <input type="hidden" name="reviewId" value={reviewId} /> : null}

      <fieldset>
        <legend id={ratingLabelId} className="text-sm font-semibold text-zinc-950 dark:text-white">Tu puntuación</legend>
        <p id={ratingHelpId} className="mt-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">Elige de 1 (muy mala) a 5 (excelente).</p>
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="radiogroup"
          aria-labelledby={ratingLabelId}
          aria-describedby={[ratingHelpId, state?.fieldErrors?.rating ? ratingErrorId : null].filter(Boolean).join(" ")}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="group relative cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
                aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
              />
              <span className="flex min-h-11 min-w-12 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-sm font-semibold tabular-nums text-zinc-500 transition group-hover:border-zinc-500 group-hover:bg-zinc-50 peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-700 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900 peer-focus-visible:ring-offset-2 dark:border-zinc-700 dark:text-zinc-400 dark:group-hover:bg-zinc-900 dark:peer-checked:border-amber-400 dark:peer-checked:bg-amber-950/30 dark:peer-checked:text-amber-300 dark:peer-focus-visible:ring-white">
                <span aria-hidden="true" className={`text-base leading-none ${value <= rating ? "text-amber-600 dark:text-amber-300" : "text-zinc-400 dark:text-zinc-500"}`}>{value <= rating ? "★" : "☆"}</span>
                <span aria-hidden="true">{value}</span>
              </span>
            </label>
          ))}
        </div>
        <span className="ml-1 mt-2 block text-xs font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">Puntuación: {rating} de 5</span>
        {state?.fieldErrors?.rating ? <p id={ratingErrorId} className="mt-2 text-sm text-red-700 dark:text-red-300">{state.fieldErrors.rating}</p> : null}
      </fieldset>

      <label className="block text-sm font-semibold text-zinc-950 dark:text-white" htmlFor={editing ? `review-content-${reviewId}` : "review-content-new"}>
        Comentario
        <textarea
          id={editing ? `review-content-${reviewId}` : "review-content-new"}
          name="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          minLength={10}
          maxLength={2_000}
          required
          rows={5}
          aria-invalid={Boolean(state?.fieldErrors?.content)}
          aria-describedby={state?.fieldErrors?.content ? `${editing ? `review-content-${reviewId}` : "review-content-new"}-error review-content-count` : "review-content-count"}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm font-normal leading-6 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300 dark:focus:bg-zinc-900"
          placeholder="Cuenta cómo fue tu experiencia en esta comunidad."
        />
        <span id="review-content-count" className="mt-1 block text-right text-xs font-normal tabular-nums text-zinc-500" aria-live="polite">
          {content.length.toLocaleString("es-ES")} / 2.000
        </span>
        {state?.fieldErrors?.content ? <span id={`${editing ? `review-content-${reviewId}` : "review-content-new"}-error`} className="mt-2 block text-sm font-normal text-red-700 dark:text-red-300">{state.fieldErrors.content}</span> : null}
      </label>

      {state?.formError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">{state.formError}</p> : null}
      <div className="flex items-center justify-end">
        <SubmitButton editing={editing} />
      </div>
    </form>
  );
}
