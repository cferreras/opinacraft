"use client";

import { useActionState, useState, startTransition, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, PlugZap, Save, XCircle } from "lucide-react";

import {
  removeVotifierAction,
  saveVotifierAction,
  testVotifierAction,
  type VotifierActionState,
} from "@/app/servers/[slug]/manage/votifier-actions";
import { LocalizedTimestamp } from "@/components/localized-timestamp";
import { SectionHeading } from "@/components/section-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { VotifierKeyType } from "@/lib/votes/votifier";
import {
  VOTIFIER_DEFAULT_PORT,
  VOTIFIER_PORT_MAX,
  VOTIFIER_PORT_MIN,
  votifierStatusLabels,
  type VotifierSettingsView,
  type VotifierStatus,
} from "@/lib/votes/votifier-display";

const statusTone: Record<VotifierStatus, { pill: string; dot: string }> = {
  connected: { pill: "bg-success/10 text-success", dot: "bg-success" },
  failing: { pill: "bg-danger/10 text-danger", dot: "bg-danger" },
  untested: { pill: "bg-warning/10 text-warning", dot: "bg-warning" },
  not_configured: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

const keyTypeOptions: { value: VotifierKeyType; label: string }[] = [
  { value: "token", label: "Token (NuVotifier)" },
  { value: "rsa", label: "Clave pública RSA (v1)" },
];

function endpointLabel(host: string, port: number) {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

export function VotifierPanel({
  serverId,
  slug,
  settings,
  status,
  defaultHost,
  available,
}: {
  serverId: string;
  slug: string;
  /** Never carries the secret: once saved it stays on the server. */
  settings: VotifierSettingsView | null;
  status: VotifierStatus;
  defaultHost: string;
  /** False while the deployment has no key to encrypt secrets with. */
  available: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState<VotifierActionState, FormData>(saveVotifierAction, null);
  const [testState, testAction, testing] = useActionState<VotifierActionState, FormData>(testVotifierAction, null);
  const [removeState, removeAction, removing] = useActionState<VotifierActionState, FormData>(removeVotifierAction, null);
  const [lastAction, setLastAction] = useState<"save" | "test" | null>(null);
  const [keyType, setKeyType] = useState<VotifierKeyType>(settings?.keyType ?? "token");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [handledSave, setHandledSave] = useState<VotifierActionState>(null);

  // Once a save lands, the typed key is gone from the page too: the panel goes back to "Clave
  // guardada" instead of holding the secret in memory for the rest of the visit.
  if (saveState !== handledSave) {
    setHandledSave(saveState);
    if (saveState?.done === "saved") {
      setSecret("");
      setShowSecret(false);
      setReplacing(false);
    }
  }

  const hasStoredSecret = Boolean(settings) && settings?.keyType === keyType;
  const editingSecret = !hasStoredSecret || replacing;
  const current = lastAction === "test" ? testState : lastAction === "save" ? saveState : null;
  const fieldErrors = current?.fieldErrors ?? {};
  const pending = saving || testing || removing;
  const tone = statusTone[status];

  // Submitting through `onSubmit` keeps what the owner typed when an action refuses the form:
  // React resets an action form once the action settles.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "test" ? "test" : "save";
    const formData = new FormData(event.currentTarget);
    setLastAction(intent);
    startTransition(() => (intent === "test" ? testAction : saveAction)(formData));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <SectionHeading
              number="Recompensas"
              icon={<PlugZap className="size-4" />}
              id="votifier-heading"
              title="Votifier"
              description="Cada voto se envía a tu servidor para que el plugin entregue la recompensa en el juego. Compatible con NuVotifier y Votifier clásico."
            />
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
            {votifierStatusLabels[status]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!available ? (
          <Alert className="border-warning/30 bg-warning/10">
            <AlertDescription className="text-warning">Votifier todavía no está disponible en OpinaCraft. Podrás conectarlo en cuanto lo activemos; los votos ya cuentan para el ranking.</AlertDescription>
          </Alert>
        ) : null}

        <form id="votifier-form" onSubmit={handleSubmit} aria-labelledby="votifier-heading">
          <input type="hidden" name="serverId" value={serverId} />
          <input type="hidden" name="slug" value={slug} />
          <fieldset disabled={!available || pending} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Field>
                <FieldLabel htmlFor="votifier-host">IP o dominio</FieldLabel>
                <Input id="votifier-host" name="host" defaultValue={settings?.host ?? defaultHost} placeholder="play.example.com" autoCapitalize="none" spellCheck={false} maxLength={253} required aria-invalid={Boolean(fieldErrors.host)} />
                {fieldErrors.host ? <ErrorText>{fieldErrors.host}</ErrorText> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="votifier-port">Puerto</FieldLabel>
                <Input id="votifier-port" name="port" type="number" inputMode="numeric" min={VOTIFIER_PORT_MIN} max={VOTIFIER_PORT_MAX} defaultValue={settings?.port ?? VOTIFIER_DEFAULT_PORT} required aria-invalid={Boolean(fieldErrors.port)} />
                {fieldErrors.port ? <ErrorText>{fieldErrors.port}</ErrorText> : null}
              </Field>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Tipo de clave</legend>
              <div className="flex flex-wrap gap-2">
                {keyTypeOptions.map((option) => {
                  const selected = keyType === option.value;
                  return (
                    <label key={option.value} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${selected ? "border-primary/40 bg-primary/5 text-foreground" : "bg-muted/20 text-muted-foreground hover:bg-muted/40"}`}>
                      <input type="radio" name="keyType" value={option.value} checked={selected} onChange={() => { setKeyType(option.value); setSecret(""); setShowSecret(false); }} className="sr-only" />
                      <span aria-hidden="true" className={`size-2 rounded-full ${selected ? "bg-primary" : "bg-muted-foreground/40"}`} />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              {fieldErrors.keyType ? <ErrorText>{fieldErrors.keyType}</ErrorText> : null}
            </fieldset>

            {editingSecret ? (
              <SecretField
                keyType={keyType}
                value={secret}
                onChange={setSecret}
                shown={showSecret}
                onToggle={() => setShowSecret((shown) => !shown)}
                error={fieldErrors.secret}
                onCancel={hasStoredSecret ? () => { setReplacing(false); setSecret(""); } : undefined}
              />
            ) : (
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">{keyType === "token" ? "Token" : "Clave pública"}</p>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <p className="inline-flex min-w-0 items-center gap-2 text-sm">
                    <KeyRound aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <span className="font-medium">Clave guardada</span>
                    <span aria-hidden="true" className="tracking-widest text-muted-foreground">···</span>
                    <span className="text-muted-foreground">cambiada el <LocalizedTimestamp value={settings?.updatedAt ?? null} mode="date" fallback="—" /></span>
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(true)}>Reemplazar</Button>
                </div>
                <p className="text-xs text-muted-foreground">Nunca se muestra en la ficha pública ni vuelve a enviarse a tu navegador.</p>
                {fieldErrors.secret ? <ErrorText>{fieldErrors.secret}</ErrorText> : null}
              </div>
            )}

            <Feedback state={current} lastAction={lastAction} />
            {!current && settings?.lastTestAt ? <LastTest settings={settings} /> : null}

          </fieldset>
        </form>

        {/* Outside the form: the removal dialog has a form of its own, and React bubbles its submit
            through the portal to any form it sits in. The buttons join the settings form by id. */}
        <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>{settings ? <RemoveVotifier serverId={serverId} slug={slug} action={(formData) => { setLastAction(null); removeAction(formData); }} removing={removing} error={removeState?.formError} /> : null}</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit" form="votifier-form" name="intent" value="test" variant="outline" disabled={!available || pending}>{testing ? "Probando…" : <><PlugZap aria-hidden="true" />Probar conexión</>}</Button>
            <Button type="submit" form="votifier-form" name="intent" value="save" disabled={!available || pending}>{saving ? "Guardando…" : <><Save aria-hidden="true" />Guardar</>}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SecretField({ keyType, value, onChange, shown, onToggle, error, onCancel }: {
  keyType: VotifierKeyType;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onToggle: () => void;
  error?: string;
  onCancel?: () => void;
}) {
  const help = keyType === "token"
    ? <>Está en <code className="font-mono">plugins/Votifier/config.yml</code>, en <code className="font-mono">tokens.default</code>. Nunca se muestra en la ficha pública.</>
    : <>Copia el contenido de <code className="font-mono">plugins/Votifier/rsa/public.key</code>. Nunca se muestra en la ficha pública.</>;
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor="votifier-secret">{keyType === "token" ? "Token" : "Clave pública"}</FieldLabel>
        {onCancel ? <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onCancel}>Mantener la clave guardada</Button> : null}
      </div>
      {keyType === "token" ? (
        <div className="flex min-w-0 items-center gap-2">
          <Input id="votifier-secret" name="secret" type={shown ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} className="min-w-0 flex-1 font-mono" aria-describedby="votifier-secret-help" aria-invalid={Boolean(error)} />
          <Button type="button" variant="outline" onClick={onToggle} aria-pressed={shown}>{shown ? <><EyeOff aria-hidden="true" />Ocultar</> : <><Eye aria-hidden="true" />Mostrar</>}</Button>
        </div>
      ) : (
        <Textarea id="votifier-secret" name="secret" value={value} onChange={(event) => onChange(event.target.value)} rows={5} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={4096} className="font-mono text-xs break-all" placeholder="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…" aria-describedby="votifier-secret-help" aria-invalid={Boolean(error)} />
      )}
      <FieldDescription id="votifier-secret-help">{help}</FieldDescription>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Field>
  );
}

function Feedback({ state, lastAction }: { state: VotifierActionState; lastAction: "save" | "test" | null }) {
  if (!state) return null;
  if (state.formError) return <Notice tone="danger">{state.formError}</Notice>;
  if (lastAction === "test" && state.test) {
    return state.test.ok ? (
      <Alert className="border-success/30 bg-success/10">
        <CheckCircle2 aria-hidden="true" className="text-success" />
        <AlertTitle className="text-success">Conexión correcta</AlertTitle>
        <AlertDescription className="text-success">Voto de prueba entregado a {endpointLabel(state.test.host, state.test.port)} en {state.test.latencyMs} ms.</AlertDescription>
      </Alert>
    ) : (
      <Alert className="border-danger/30 bg-danger/10">
        <XCircle aria-hidden="true" className="text-danger" />
        <AlertTitle className="text-danger">No se pudo entregar el voto de prueba</AlertTitle>
        <AlertDescription className="text-danger">{state.test.message}</AlertDescription>
      </Alert>
    );
  }
  if (lastAction === "save" && state.done === "saved") return <Notice tone="success">Se guardó Votifier. Pulsa «Probar conexión» para enviar un voto de prueba.</Notice>;
  return null;
}

function LastTest({ settings }: { settings: VotifierSettingsView }) {
  return (
    <p className="text-xs text-muted-foreground">
      Última prueba <LocalizedTimestamp value={settings.lastTestAt} />:{" "}
      {settings.lastTestOk
        ? <span className="text-success">correcta{settings.lastTestLatencyMs !== null ? ` en ${settings.lastTestLatencyMs} ms` : ""}</span>
        : <span className="text-danger">fallida</span>}
    </p>
  );
}

function RemoveVotifier({ serverId, slug, action, removing, error }: { serverId: string; slug: string; action: (formData: FormData) => void; removing: boolean; error?: string }) {
  return (
    <div className="grid gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-destructive">{removing ? "Quitando…" : "Quitar Votifier"}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar Votifier?</AlertDialogTitle>
            <AlertDialogDescription>Se borrarán la dirección y la clave guardadas. Los votos seguirán contando para el ranking, pero el servidor dejará de recibirlos y no entregará recompensas.</AlertDialogDescription>
          </AlertDialogHeader>
          <form action={action}>
            <input type="hidden" name="serverId" value={serverId} />
            <input type="hidden" name="slug" value={slug} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <Button type="submit" variant="destructive">Quitar Votifier</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "success" | "danger" }) {
  return <Alert className={tone === "success" ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}><AlertDescription className={tone === "success" ? "text-success" : "text-danger"}>{children}</AlertDescription></Alert>;
}

function ErrorText({ children }: { children: string }) {
  return <p role="alert" className="text-sm text-destructive">{children}</p>;
}
