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
    const response = await fetch(`/api/servers/${serverId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details }) });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Report submitted. Thank you." : result.error ?? "Unable to submit report.");
    setPending(false);
  }
  return <form onSubmit={submit} className="mt-10 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"><h2 className="text-base font-semibold">Report this listing</h2><div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]"><select value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="inappropriate">Inappropriate</option><option value="misleading">Misleading</option><option value="offline">Offline</option><option value="copyright">Copyright</option><option value="other">Other</option></select><input value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2_000} placeholder="Optional details" className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" /><button disabled={pending} className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700">{pending ? "Sending…" : "Report"}</button></div>{message ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400" role="status">{message}</p> : null}</form>;
}
