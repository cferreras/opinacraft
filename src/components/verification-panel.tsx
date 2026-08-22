"use client";

import { Check, Copy, ShieldCheck } from "lucide-react";

import { checkVerificationAction, startVerificationAction } from "@/app/servers/[slug]/manage/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalizedTimestamp } from "@/components/localized-timestamp";

type VerificationEdition = "java" | "bedrock";
type Display = {
  id: string;
  status: string;
  attemptCount: number;
  lastFailureCode: string | null;
  expiresAt: Date;
  code: string | null;
} | null;

type VerificationPanelProps = {
  serverId: string;
  slug: string;
  verification: Display;
  targetEdition: VerificationEdition;
  targetAddress: string;
};

function verificationStatusLabel(status?: string | null) {
  if (status === "verified") return "Verificada";
  if (status === "pending") return "Pendiente";
  return "Sin verificar";
}

export function VerificationPanel({ serverId, slug, verification, targetEdition, targetAddress }: VerificationPanelProps) {
  const active = verification?.status === "pending" && verification.code;
  const verified = verification?.status === "verified";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" /> Verificar identidad</CardTitle>
        <CardDescription>Demuestra que controlas la comunidad añadiendo un código temporal al MOTD de una dirección pública.</CardDescription>
        <Badge variant={verified ? "default" : active ? "secondary" : "outline"} className="w-fit">{verified && <Check className="mr-1 size-3" />}{verificationStatusLabel(verification?.status)}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Dirección que se verificará</p>
          <code className="mt-1 block truncate text-sm text-foreground">{targetAddress}</code>
        </div>
        {verified ? (
          <p className="rounded-lg bg-success/10 p-4 text-sm leading-5 text-success">La identidad de este servidor ya está verificada.</p>
        ) : active ? (
          <div className="grid gap-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Código MOTD temporal</p>
              <code className="mt-2 block text-2xl font-semibold tracking-[0.16em] text-primary">{verification.code}</code>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Caduca el <LocalizedTimestamp value={verification.expiresAt} mode="datetime" />. Intentos usados: {verification.attemptCount}/5.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={checkVerificationAction}>
                <input type="hidden" name="serverId" value={serverId} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="verificationId" value={verification.id} />
                <input type="hidden" name="edition" value={targetEdition} />
                <Button type="submit"><Check className="size-4" /> Comprobar MOTD</Button>
              </form>
              <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(verification.code ?? "")}><Copy className="size-4" /> Copiar código</Button>
            </div>
          </div>
        ) : (
          <form action={startVerificationAction} className="grid gap-3 rounded-lg bg-muted/50 p-4">
            <p className="text-sm leading-5 text-muted-foreground">Genera un código y colócalo en el MOTD antes de comprobar esta dirección.</p>
            <input type="hidden" name="serverId" value={serverId} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="edition" value={targetEdition} />
            <Button type="submit" className="w-fit">Generar código de verificación</Button>
          </form>
        )}
        {verification?.lastFailureCode ? <Alert><AlertDescription>Último resultado: {verification.lastFailureCode.replaceAll("_", " ")}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}

export function VerificationPanelEmpty() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" /> Verificar identidad</CardTitle>
        <CardDescription>Necesitas una dirección pública de Minecraft para demostrar que controlas la comunidad.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-lg bg-muted/50 p-4 text-sm leading-5 text-muted-foreground">Añade al menos una dirección de conexión en los detalles del servidor y vuelve aquí para iniciar la verificación.</p>
      </CardContent>
    </Card>
  );
}
