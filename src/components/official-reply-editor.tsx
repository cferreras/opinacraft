"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ReviewActionState } from "@/app/servers/[slug]/actions";
import { updateOfficialReplyAction } from "@/app/servers/[slug]/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-9 rounded-lg border border-indigo-300 px-3 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-100 dark:hover:bg-indigo-950/50">{pending ? "Guardando…" : "Editar"}</button>;
}

export function OfficialReplyEditor({ replyId, slug, content }: { replyId: string; slug: string; content: string }) {
  const [state, action] = useActionState<ReviewActionState | null, FormData>(async (_state, formData) => {
    await updateOfficialReplyAction(formData);
    return null;
  }, null);
  return (
    <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="replyId" value={replyId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="sr-only" htmlFor={`edit-reply-${replyId}`}>Editar respuesta oficial</label>
      <textarea id={`edit-reply-${replyId}`} name="content" defaultValue={content} minLength={10} maxLength={2_000} rows={3} className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm leading-6 dark:border-indigo-900 dark:bg-zinc-950" />
      <div className="flex items-start"><SaveButton /></div>
      {state?.formError ? <p className="text-xs text-red-700 dark:text-red-300" role="alert">{state.formError}</p> : null}
    </form>
  );
}
