"use client";

import { useState } from "react";

const reasons = [
  ["spam", "Spam"],
  ["harassment", "Acoso"],
  ["offensive", "Contenido ofensivo"],
  ["false_information", "Información falsa"],
  ["conflict_of_interest", "Conflicto de intereses"],
  ["other", "Otro"],
] as const;

export function ReviewReportForm({ serverId, reviewId }: { serverId: string; reviewId: string }) {
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/reviews/${reviewId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Gracias. Hemos recibido tu reporte." : result.error ?? "No se pudo enviar el reporte.");
    } catch {
      setMessage("No se pudo enviar el reporte. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="group mt-2.5">
      <summary className="w-fit cursor-pointer text-[0.625rem] font-normal text-[#8a94a4] transition-colors hover:text-[#59657e] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4655e8]/20 group-open:text-[#59657e] dark:text-zinc-500 dark:hover:text-zinc-300 dark:group-open:text-zinc-300">Reportar opinión</summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Motivo
          <select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-900">
            {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Detalle opcional
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1_000} rows={3} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-zinc-500">{details.length} / 1.000</span><button type="submit" disabled={pending} className="min-h-10 rounded-lg border border-zinc-300 px-3 text-xs font-semibold hover:bg-white disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800">{pending ? "Enviando…" : "Enviar reporte"}</button></div>
        {message ? <p className="text-xs text-zinc-600 dark:text-zinc-400" role="status">{message}</p> : null}
      </form>
    </details>
  );
}
