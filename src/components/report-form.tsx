"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

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
    <Card>
      <CardHeader><CardTitle className="text-base">¿Hay algo que debamos revisar?</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">Ayúdanos a mantener el directorio fiable y útil.</p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[15rem_minmax(0,1fr)_auto] sm:items-end">
          <Field><FieldLabel htmlFor="report-reason">Motivo del reporte</FieldLabel><NativeSelect id="report-reason" value={reason} onChange={(event) => setReason(event.target.value)} className="w-full"><option value="inappropriate">Contenido inapropiado</option><option value="misleading">Información engañosa</option><option value="offline">Servidor fuera de línea</option><option value="copyright">Derechos de autor</option><option value="other">Otro</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="report-details">Detalles opcionales</FieldLabel><Input id="report-details" value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2_000} placeholder="Cuéntanos qué debemos revisar" /></Field>
          <Button type="submit" variant="outline" disabled={pending}>{pending ? "Enviando…" : "Enviar reporte"}</Button>
        </form>
        {message ? <Alert className="mt-3"><AlertDescription>{message}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
