"use client";

import { useState } from "react";

export function ReportForm({ serverId }: { serverId: string }) {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details }) });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Hemos recibido tu reporte. Gracias." : result.error ?? "No se pudo enviar el reporte.");
    } catch {
      setMessage("No se pudo enviar el reporte. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="ui-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-[15px] font-semibold text-[#17202a]">¿Hay algo que debamos revisar?</h2><p className="mt-1 text-[11px] text-[#7a8595]">Ayúdanos a mantener el directorio fiable y útil.</p></div>
      </div>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-[240px_minmax(0,1fr)_auto]">
        <label className="sr-only" htmlFor="report-reason">Motivo del reporte</label>
        <select id="report-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-lg border border-[#d9e0e6] bg-white px-3 text-[12px] text-[#33404c] outline-none focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/10"><option value="inappropriate">Contenido inapropiado</option><option value="misleading">Información engañosa</option><option value="offline">Servidor fuera de línea</option><option value="copyright">Derechos de autor</option><option value="other">Otro</option></select>
        <label className="sr-only" htmlFor="report-details">Detalles</label>
        <input id="report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2_000} placeholder="Detalles opcionales" className="h-10 rounded-lg border border-[#d9e0e6] bg-white px-3 text-[12px] text-[#33404c] outline-none placeholder:text-[#929baa] focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/10" />
        <button type="submit" disabled={pending} className="h-10 rounded-lg border border-[#cfd7df] px-4 text-[12px] font-semibold text-[#33404c] transition hover:border-[#a9b3bf] hover:bg-[#f7f8fa] disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Enviando…" : "Enviar reporte"}</button>
      </div>
      {message ? <p className="mt-3 text-[12px] text-[#617084]" role="status">{message}</p> : null}
    </form>
  );
}
