"use client";

import { useActionState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";

import { checkVerificationAction, startVerificationAction, type VerificationErrorReason, type VerificationOutcome, type VerificationState } from "@/app/servers/[slug]/manage/actions";
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

type Feedback = { tone: "success" | "warning"; text: string };

const outcomeFeedback: Record<VerificationOutcome, Feedback> = {
  started: { tone: "success", text: "Código generado. Pégalo al final de tu MOTD y pulsa «Comprobar MOTD»." },
  verified: { tone: "success", text: "Identidad verificada. Ya puedes retirar el código del MOTD." },
  code_not_found: { tone: "warning", text: "No se encontró el código en el MOTD de esa dirección. Comprueba que lo añadiste al final, que guardaste y recargaste (por ejemplo, con /minimotd reload si usas MiniMOTD) y vuelve a intentarlo." },
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
  pending: { tone: "warning", text: "Ya hay un código pendiente para esta dirección. Pégalo al final del MOTD antes de comprobarla." },
  "no-endpoint": { tone: "warning", text: "Añade una dirección pública de Minecraft antes de verificar la identidad de este servidor." },
  "rate-limit": { tone: "warning", text: "Demasiados intentos seguidos. Espera un momento antes de volver a comprobar." },
  unavailable: { tone: "warning", text: "El servicio de verificación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos." },
  unknown: { tone: "warning", text: "No se pudo completar la verificación. Inténtalo de nuevo." },
};

function feedbackFor(state: VerificationState, lastFailureCode: string | null): Feedback | null {
  if (state && "outcome" in state) return outcomeFeedback[state.outcome] ?? null;
  if (state && "error" in state) return errorFeedback[state.error] ?? null;
  // With no fresh result to show, fall back to how the previous attempt ended.
  return lastFailureCode ? outcomeFeedback[lastFailureCode as VerificationOutcome] ?? null : null;
}

function verificationStatusLabel(status?: string | null) {
  if (status === "verified") return "Verificada";
  if (status === "pending") return "Pendiente";
  return "Sin verificar";
}

export function VerificationPanel({ serverId, slug, verification, targetEdition, targetAddress }: VerificationPanelProps) {
  const [startState, startAction, starting] = useActionState(startVerificationAction, null);
  const [checkState, checkAction, checking] = useActionState(checkVerificationAction, null);
  const active = verification?.status === "pending" && verification.code;
  const verified = verification?.status === "verified";
  const feedback = feedbackFor(checkState ?? startState, verification?.lastFailureCode ?? null);

  const helpId = `motd-ayuda-${targetEdition}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" /> Verificar identidad</CardTitle>
        <CardDescription>Pega un código temporal en el mensaje que aparece en la lista de servidores (el MOTD) para demostrar que lo controlas. Funciona con el MOTD normal y con plugins o mods como MiniMOTD.</CardDescription>
        <Badge variant={verified ? "default" : active ? "secondary" : "outline"} className="w-fit">{verified && <Check className="mr-1 size-3" />}{verificationStatusLabel(verification?.status)}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Dirección que se verificará</p>
          <code className="mt-1 block truncate text-sm text-foreground">{targetAddress}</code>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">El código tiene que aparecer en el MOTD de esta dirección ({targetEdition === "bedrock" ? "Bedrock" : "Java"}).</p>
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
              <form action={checkAction}>
                <input type="hidden" name="serverId" value={serverId} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="verificationId" value={verification.id} />
                <input type="hidden" name="edition" value={targetEdition} />
                <Button type="submit" disabled={checking}><Check className="size-4" /> {checking ? "Comprobando…" : "Comprobar MOTD"}</Button>
              </form>
              <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(verification.code ?? "")}><Copy className="size-4" /> Copiar código</Button>
            </div>
            <VerificationSteps edition={targetEdition} />
          </div>
        ) : (
          <div className="grid gap-3">
            <form action={startAction} className="grid gap-3 rounded-lg bg-muted/50 p-4">
              <p className="text-sm leading-5 text-muted-foreground">Genera un código y pégalo en cualquier parte de tu MOTD actual, sin borrar tu mensaje. Después vuelve aquí y compruébalo.</p>
              <input type="hidden" name="serverId" value={serverId} />
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="edition" value={targetEdition} />
              <Button type="submit" className="w-fit" disabled={starting}>{starting ? "Generando…" : "Generar código de verificación"}</Button>
            </form>
            <details id={helpId} className="group rounded-lg border bg-background p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">¿Dónde se pone el código? Ver ejemplos para MOTD y MiniMOTD</summary>
              <div className="mt-3"><VerificationSteps edition={targetEdition} /></div>
            </details>
          </div>
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

function VerificationSteps({ edition }: { edition: VerificationEdition }) {
  const isBedrock = edition === "bedrock";
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-4">
      <p className="text-sm font-semibold text-foreground">Cómo poner el código en el MOTD</p>
      <p className="text-sm leading-5 text-muted-foreground">
        El MOTD es el mensaje que se ve en la lista de servidores, debajo del nombre.
        No tienes que borrar tu mensaje: basta con añadir el código al final y guardar.
      </p>
      <ol className="grid list-decimal gap-2.5 pl-5 text-sm leading-5 text-muted-foreground marker:font-semibold marker:text-foreground">
        <li>
          <span className="font-medium text-foreground">Copia el código</span> con el botón de copiar.
          Lo detectamos aunque uses mayúsculas, minúsculas, colores o formato.
        </li>
        <li>
          {isBedrock ? (
            <>
              <span className="font-medium text-foreground">Pégalo en el MOTD de Bedrock.</span>{" "}
              En <code className="rounded bg-muted px-1 py-0.5 text-xs">server.properties</code> edita{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">server-name=Mi servidor OPINACRAFT-XXXXX-XXXXX</code>,
              guarda y reinicia el servidor.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">Pégalo en el MOTD de Java.</span> Elige según
              cómo tengas configurado el mensaje:
              <ul className="mt-2 grid list-disc gap-1.5 pl-5">
                <li>
                  <span className="font-medium text-foreground">Vanilla, Paper, Spigot o Purpur sin plugins de MOTD:</span>{" "}
                  abre <code className="rounded bg-muted px-1 py-0.5 text-xs">server.properties</code>, edita{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">motd=Mi servidor OPINACRAFT-XXXXX-XXXXX</code>,
                  guarda y reinicia.
                </li>
                <li>
                  <span className="font-medium text-foreground">Con MiniMOTD (Paper, Velocity, BungeeCord, Spigot o mod):</span>{" "}
                  abre <code className="rounded bg-muted px-1 py-0.5 text-xs">plugins/MiniMOTD/main.conf</code>,
                  añade el código al final de todos tus textos en la lista de MOTDs (si rotan, solo lo vemos cuando toca el que lo lleva), por ejemplo{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">&lt;gray&gt;Mi servidor OPINACRAFT-XXXXX-XXXXX</code>,
                  guarda y ejecuta <code className="rounded bg-muted px-1 py-0.5 text-xs">/minimotd reload</code> o
                  reinicia. Vale con colores, degradados y MiniMessage.
                </li>
              </ul>
            </>
          )}
        </li>
        <li>
          <span className="font-medium text-foreground">Vuelve aquí y pulsa «Comprobar MOTD».</span>{" "}
          Nos conectamos a tu dirección pública como un jugador más y buscamos el código.
          Cuando termines, puedes quitarlo del MOTD.
        </li>
      </ol>
      <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-4 text-muted-foreground">
        Compatible con el MOTD normal y con MiniMOTD y plugins similares. Si usas proxy (Velocity o BungeeCord),
        pon el código en el MOTD del proxy, que es el que responde a la dirección pública.
      </p>
    </div>
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
