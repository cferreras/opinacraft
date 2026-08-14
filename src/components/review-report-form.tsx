"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const reasons = [
  ["spam", "Spam"],
  ["harassment", "Acoso"],
  ["offensive", "Contenido ofensivo"],
  ["false_information", "Información falsa"],
  ["conflict_of_interest", "Conflicto de intereses"],
  ["other", "Otro"],
] as const;

export function ReviewReportForm({ serverId, reviewId }: { serverId: string; reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/reviews/${reviewId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details }) });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Gracias. Hemos recibido tu reporte." : result.error ?? "No se pudo enviar el reporte.");
      if (response.ok) setTimeout(() => setOpen(false), 700);
    } catch {
      setMessage("No se pudo enviar el reporte. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="link" size="sm" className="h-auto justify-start p-0 text-xs text-muted-foreground">Reportar opinión</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reportar opinión</DialogTitle><DialogDescription>Ayúdanos a mantener las reseñas fiables y útiles.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field><FieldLabel htmlFor={`review-report-reason-${reviewId}`}>Motivo</FieldLabel><NativeSelect id={`review-report-reason-${reviewId}`} size="lg" value={reason} onChange={(event) => setReason(event.target.value)} className="w-full">{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor={`review-report-details-${reviewId}`}>Detalle opcional</FieldLabel><Textarea id={`review-report-details-${reviewId}`} value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1_000} rows={4} /><p className="text-right text-xs tabular-nums text-muted-foreground">{details.length} / 1.000</p></Field>
          {message ? <Alert variant={message.startsWith("Gracias") ? "default" : "destructive"}><AlertDescription>{message}</AlertDescription></Alert> : null}
          <DialogFooter><Button type="button" size="lg" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" size="lg" disabled={pending}>{pending ? "Enviando…" : "Enviar reporte"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
