"use client";

import { Check, Copy, ShieldCheck } from "lucide-react";

import { checkVerificationAction, startVerificationAction } from "@/app/servers/[slug]/manage/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Display = { id: string; status: string; attemptCount: number; lastFailureCode: string | null; expiresAt: Date; code: string | null } | null;

function verificationStatusLabel(status?: string | null) {
  if (status === "verified") return "Verificado";
  if (status === "pending") return "Pendiente";
  return "Sin verificar";
}

export function VerificationPanel({ serverId, slug, verification, edition = "java" }: { serverId: string; slug: string; verification: Display; edition?: "java" | "bedrock" }) {
  const active = verification?.status === "pending" && verification.code;
  const label = edition === "java" ? "Java" : "Bedrock";
  const verified = verification?.status === "verified";

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" /> Verificación de propiedad · {label}</CardTitle><p className="text-sm text-muted-foreground">Añade un código temporal al MOTD para demostrar que controlas esta dirección.</p><Badge variant={verified ? "default" : active ? "secondary" : "outline"} className="w-fit">{verified && <Check className="mr-1 size-3" />}{verificationStatusLabel(verification?.status)}</Badge></CardHeader>
      <CardContent>
        {active ? <div className="grid gap-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Código MOTD temporal</p><code className="mt-2 block text-2xl font-semibold tracking-[0.16em] text-primary">{verification.code}</code><p className="mt-2 text-sm leading-5 text-muted-foreground">Caduca el {verification.expiresAt.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" })}. Intentos usados: {verification.attemptCount}/5.</p></div><div className="flex flex-wrap gap-2"><form action={checkVerificationAction}><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="verificationId" value={verification.id} /><input type="hidden" name="edition" value={edition} /><Button type="submit"><Check className="size-4" /> Comprobar MOTD</Button></form><Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(verification.code ?? "")}><Copy className="size-4" /> Copiar código</Button></div></div> : <form action={startVerificationAction} className="grid gap-3 rounded-lg bg-muted/50 p-4"><p className="text-sm leading-5 text-muted-foreground">Genera un código y colócalo en el MOTD antes de comprobar este endpoint.</p><input type="hidden" name="serverId" value={serverId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="edition" value={edition} /><Button type="submit" className="w-fit">Generar código de verificación</Button></form>}
        {verification?.lastFailureCode ? <Alert className="mt-4"><AlertDescription>Último resultado: {verification.lastFailureCode.replaceAll("_", " ")}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
