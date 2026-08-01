"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ReviewActionState } from "@/app/servers/[slug]/actions";
import { createOfficialReplyAction } from "@/app/servers/[slug]/actions";

function SubmitReplyButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-10 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200">{pending ? "Guardando…" : "Responder oficialmente"}</button>;
}

export function OfficialReplyForm({ reviewId, slug }: { reviewId: string; slug: string }) {
  const [state, action] = useActionState<ReviewActionState | null, FormData>(createOfficialReplyAction, null);
  return (
    <form action={action} className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/70 dark:bg-indigo-950/20">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="block text-sm font-semibold text-indigo-950 dark:text-indigo-100" htmlFor={`reply-content-${reviewId}`}>
        Respuesta oficial
        <textarea id={`reply-content-${reviewId}`} name="content" required minLength={10} maxLength={2_000} rows={3} aria-describedby={`reply-count-${reviewId}`} className="mt-2 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-normal leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-indigo-900 dark:bg-zinc-950" placeholder="Responde en nombre del equipo del servidor." />
        <span id={`reply-count-${reviewId}`} className="mt-1 block text-right text-xs font-normal text-indigo-800/70 dark:text-indigo-200/70">Máximo 2.000 caracteres</span>
      </label>
      {state?.fieldErrors?.content ? <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{state.fieldErrors.content}</p> : null}
      {state?.formError ? <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">{state.formError}</p> : null}
      <div className="mt-3 flex justify-end"><SubmitReplyButton /></div>
    </form>
  );
}
