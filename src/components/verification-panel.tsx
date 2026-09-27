"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Copy, Info, RefreshCw, ShieldCheck } from "lucide-react";

import { checkVerificationAction, startVerificationAction, type VerificationErrorReason, type VerificationOutcome, type VerificationState } from "@/app/servers/[slug]/manage/actions";
import { LocalizedTimestamp } from "@/components/localized-timestamp";
import { SectionHeading } from "@/components/section-heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

type Feedback = { tone: "success" | "warning"; text: string };
type StepState = "done" | "current" | "upcoming";

const MAX_ATTEMPTS = 5;
const PLACEHOLDER_CODE = "OPINACRAFT-XXXXX-XXXXX";

const outcomeFeedback: Record<VerificationOutcome, Feedback> = {
  started: { tone: "success", text: "Código generado. Añádelo a tu MOTD y pulsa «Comprobar MOTD»." },
  verified: { tone: "success", text: "Identidad verificada. Ya puedes retirar el código del MOTD." },
  code_not_found: { tone: "warning", text: "No se encontró el código en el MOTD de esa dirección. Comprueba que lo añadiste, que guardaste y recargaste (por ejemplo, con /minimotd reload si usas MiniMOTD) y vuelve a intentarlo." },
  offline: { tone: "warning", text: "El servidor está fuera de línea o no respondió a tiempo." },
  timeout: { tone: "warning", text: "La comprobación agotó el tiempo de espera." },
  blocked_target: { tone: "warning", text: "Este destino está bloqueado porque no es una dirección pública." },
  invalid_response: { tone: "warning", text: "El servidor devolvió una respuesta no válida." },
  endpoint_taken: { tone: "warning", text: "Esta dirección ya está verificada por otro servidor." },
  endpoint_changed: { tone: "warning", text: "La dirección cambió durante la comprobación. Genera un código nuevo." },
  stale: { tone: "warning", text: "La verificación ya no está activa. Genera un código nuevo." },
  expired: { tone: "warning", text: "El código de verificación ha caducado. Genera uno nuevo." },
};

const errorFeedback: Record<VerificationErrorReason, Feedback> = {
  "already-verified": { tone: "success", text: "La identidad de este servidor ya está verificada; no necesitas generar otro código." },
  pending: { tone: "warning", text: "Ya hay un código pendiente para esta dirección. Añádelo al MOTD antes de comprobarla." },
  "no-endpoint": { tone: "warning", text: "Añade una dirección pública de Minecraft antes de verificar la identidad de este servidor." },
  "rate-limit": { tone: "warning", text: "Demasiados intentos seguidos. Espera un momento antes de volver a comprobar." },
  unavailable: { tone: "warning", text: "El servicio de verificación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos." },
  unknown: { tone: "warning", text: "No se pudo completar la verificación. Inténtalo de nuevo." },
};

const statusTone = {
  verified: { label: "Verificada", pill: "bg-success/10 text-success", dot: "bg-success" },
  pending: { label: "Pendiente", pill: "bg-warning/10 text-warning", dot: "bg-warning" },
  unverified: { label: "Sin verificar", pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
} as const;

function feedbackFor(state: VerificationState, lastFailureCode: string | null): Feedback | null {
  if (state && "outcome" in state) return outcomeFeedback[state.outcome] ?? null;
  if (state && "error" in state) return errorFeedback[state.error] ?? null;
  // With no fresh result to show, fall back to how the previous attempt ended.
  return lastFailureCode ? outcomeFeedback[lastFailureCode as VerificationOutcome] ?? null : null;
}

export function VerificationPanel({ serverId, slug, verification, targetEdition, targetAddress }: VerificationPanelProps) {
  const [startState, startAction, starting] = useActionState(startVerificationAction, null);
  const [checkState, checkAction, checking] = useActionState(checkVerificationAction, null);
  const active = verification?.status === "pending" && verification.code ? verification : null;
  const verified = verification?.status === "verified";
  const feedback = feedbackFor(checkState ?? startState, verification?.lastFailureCode ?? null);
  const status = statusTone[verified ? "verified" : active ? "pending" : "unverified"];
  const editionLabel = targetEdition === "bedrock" ? "Bedrock" : "Java";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <SectionHeading
              number="Propiedad"
              icon={<ShieldCheck className="size-4" />}
              title="Verificar identidad"
              description="Demuestra que controlas este servidor añadiendo un código temporal a su MOTD, el mensaje que aparece bajo el nombre en la lista de servidores."
            />
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${status.pill}`}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Dirección que se verificará</p>
            <code className="block truncate font-mono text-sm font-medium text-foreground">{targetAddress}</code>
          </div>
          <span className="shrink-0 rounded-md border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">{editionLabel}</span>
        </div>

        {verified ? (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-success">Identidad verificada</p>
              <p className="mt-0.5 text-sm leading-5 text-success/90">La identidad de este servidor ya está verificada. Si aún tienes el código en el MOTD, ya puedes quitarlo.</p>
            </div>
          </div>
        ) : (
          <ol className="grid">
            <Step number={1} state={active ? "done" : "current"} title="Genera un código">
              {active ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 pl-3">
                    <code className="min-w-0 flex-1 break-all font-mono text-base font-semibold tracking-[0.08em] text-primary sm:text-lg">{active.code}</code>
                    <CopyCodeButton value={active.code ?? ""} />
                  </div>
                  <p className="text-xs leading-4 text-muted-foreground">
                    Caduca el <LocalizedTimestamp value={active.expiresAt} mode="datetime" /> · {active.attemptCount}/{MAX_ATTEMPTS} comprobaciones usadas
                  </p>
                </div>
              ) : (
                <form action={startAction} className="grid gap-3">
                  <p className="text-sm leading-5 text-muted-foreground">Es temporal y solo sirve para esta dirección.</p>
                  <input type="hidden" name="serverId" value={serverId} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="edition" value={targetEdition} />
                  <Button type="submit" className="w-fit" disabled={starting}>{starting ? "Generando…" : "Generar código de verificación"}</Button>
                </form>
              )}
            </Step>

            <Step number={2} state={active ? "current" : "upcoming"} title="Añádelo a tu MOTD">
              <p className="text-sm leading-5 text-muted-foreground">
                Pégalo en cualquier parte del MOTD sin borrar tu mensaje y guarda los cambios.
                Lo detectamos aunque tenga colores, formato o cambie de mayúsculas.
              </p>
              <MotdExamples edition={targetEdition} code={active?.code ?? PLACEHOLDER_CODE} />
            </Step>

            <Step number={3} state={active ? "current" : "upcoming"} title="Comprueba el MOTD" last>
              <p className="text-sm leading-5 text-muted-foreground">
                Nos conectamos a tu dirección como un jugador más y buscamos el código. Cuando se verifique, puedes quitarlo.
              </p>
              {active ? (
                <form action={checkAction}>
                  <input type="hidden" name="serverId" value={serverId} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="verificationId" value={active.id} />
                  <input type="hidden" name="edition" value={targetEdition} />
                  <Button type="submit" disabled={checking}>
                    {checking ? <RefreshCw aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                    {checking ? "Comprobando…" : "Comprobar MOTD"}
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="outline" className="w-fit" disabled>Comprobar MOTD</Button>
              )}
            </Step>
          </ol>
        )}

        {feedback ? (
          <Alert aria-live="polite" className={feedback.tone === "warning" ? "border-warning/30 bg-warning/10" : "border-success/30 bg-success/10"}>
            <AlertDescription className={feedback.tone === "warning" ? "text-warning" : "text-success"}>{feedback.text}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Step({ number, state, title, last = false, children }: { number: number; state: StepState; title: string; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3" aria-current={state === "current" ? "step" : undefined}>
      {!last ? <span aria-hidden="true" className={cn("absolute top-8 bottom-1 left-[0.875rem] w-px -translate-x-1/2", state === "done" ? "bg-primary/40" : "bg-border")} /> : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
          state === "done" && "bg-primary text-primary-foreground",
          state === "current" && "border-2 border-primary bg-background text-primary",
          state === "upcoming" && "border bg-muted text-muted-foreground",
        )}
      >
        {state === "done" ? <Check className="size-3.5" /> : number}
      </span>
      <div className={cn("grid min-w-0 gap-2.5 pt-1", !last && "pb-6")}>
        <h3 className={cn("text-sm font-semibold", state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
          <span className="sr-only">Paso {number}{state === "done" ? " (completado)" : ""}: </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

function CopyCodeButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="shrink-0 bg-background">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copiado" : "Copiar código"}
    </Button>
  );
}

function MotdExamples({ edition, code }: { edition: VerificationEdition; code: string }) {
  if (edition === "bedrock") {
    return (
      <ExampleBox file="server.properties" line={`server-name=Mi servidor ${code}`}>
        Guarda y reinicia el servidor.
      </ExampleBox>
    );
  }

  return (
    <div className="grid gap-3">
      <Tabs defaultValue="vanilla" className="gap-3">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="vanilla">server.properties</TabsTrigger>
          <TabsTrigger value="minimotd">MiniMOTD</TabsTrigger>
        </TabsList>
        <TabsContent value="vanilla">
          <ExampleBox file="server.properties" line={`motd=Mi servidor ${code}`}>
            Para Vanilla, Paper, Spigot o Purpur sin plugins de MOTD. Guarda y reinicia el servidor.
          </ExampleBox>
        </TabsContent>
        <TabsContent value="minimotd">
          <ExampleBox file="plugins/MiniMOTD/main.conf" line={`<gray>Mi servidor ${code}`}>
            En Fabric el archivo está en <InlineCode>config/MiniMOTD/main.conf</InlineCode>. Añade el código a todos los MOTD de la lista
            (si rotan, solo lo vemos cuando sale uno que lo lleva) y ejecuta <InlineCode>/minimotd reload</InlineCode> o reinicia.
          </ExampleBox>
        </TabsContent>
      </Tabs>
      <p className="flex items-start gap-2 text-xs leading-4 text-muted-foreground">
        <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>Si usas un proxy (Velocity o BungeeCord), pon el código en el MOTD del proxy: es el que responde a la dirección pública.</span>
      </p>
    </div>
  );
}

function ExampleBox({ file, line, children }: { file: string; line: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">{file}</div>
      <pre className="overflow-x-auto bg-background px-3 py-2.5 font-mono text-xs leading-5 text-foreground"><code>{line}</code></pre>
      <p className="border-t bg-muted/20 px-3 py-2 text-xs leading-4 text-muted-foreground">{children}</p>
    </div>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">{children}</code>;
}

export function VerificationPanelEmpty() {
  return (
    <Card>
      <CardHeader>
        <SectionHeading
          number="Propiedad"
          icon={<ShieldCheck className="size-4" />}
          title="Verificar identidad"
          description="Necesitas una dirección pública de Minecraft para demostrar que controlas la comunidad."
        />
      </CardHeader>
      <CardContent>
        <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm leading-5 text-muted-foreground">Añade al menos una dirección de conexión en los detalles del servidor y vuelve aquí para iniciar la verificación.</p>
      </CardContent>
    </Card>
  );
}
