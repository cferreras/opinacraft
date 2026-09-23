"use client";

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export function ReportForm({ serverId }: { serverId: string }) {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Folded by default, like the rest of the ficha's secondary actions; any link to #report unfolds it.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openFromHash = () => { if (window.location.hash === "#report") setOpen(true); };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

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
    <Card className="gap-0 bg-transparent py-3.25 ring-0 max-sm:py-0 sm:outline-1 sm:-outline-offset-1 sm:outline-dashed sm:outline-foreground/20 [--card-spacing:--spacing(5.25)]">
      <div className="flex flex-wrap items-center justify-center gap-x-2 px-5.25 sm:justify-start sm:gap-x-3.25">
        <Flag aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 text-sm text-muted-foreground max-sm:sr-only">¿Algo no cuadra en esta ficha? Revisamos cada aviso.</h2>
        <button type="button" aria-expanded={open} aria-controls="report-form" onClick={() => setOpen((current) => !current)} className="min-h-11 text-sm font-bold text-primary-ink hover:underline max-sm:text-muted-foreground">
          Informar de un problema
        </button>
      </div>
      {open ? (
      <CardContent id="report-form" className="pb-2 pt-3.25">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[15rem_minmax(0,1fr)_auto] sm:items-end">
          <Field><FieldLabel htmlFor="report-reason">Motivo del reporte</FieldLabel><NativeSelect id="report-reason" size="lg" value={reason} onChange={(event) => setReason(event.target.value)} className="w-full"><option value="inappropriate">Contenido inapropiado</option><option value="misleading">Información engañosa</option><option value="offline">Servidor fuera de línea</option><option value="copyright">Derechos de autor</option><option value="other">Otro</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="report-details">Detalles opcionales</FieldLabel><Input id="report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2_000} placeholder="Cuéntanos qué debemos revisar" className="h-10" /></Field>
          <Button type="submit" size="lg" variant="outline" disabled={pending}>{pending ? "Enviando…" : "Enviar reporte"}</Button>
        </form>
        {message ? <Alert className="mt-3"><AlertDescription>{message}</AlertDescription></Alert> : null}
      </CardContent>
      ) : null}
    </Card>
  );
}
