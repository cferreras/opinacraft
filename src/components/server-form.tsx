"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ArrowRight, Check, FileText, Image as ImageIcon, Link2, Monitor, Smartphone } from "lucide-react";

import { createServerAction, type CreateServerState } from "@/app/servers/new/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError as UiFieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CopyAddressButton } from "@/components/copy-address-button";
import { SectionHeading } from "@/components/section-heading";
import { ServerAccessFields } from "@/components/server-access-fields";
import { ServerDraftRail } from "@/components/server-draft-rail";
import { TagCombobox } from "@/components/tag-combobox";
import { SERVER_DESCRIPTION_MAX_LENGTH } from "@/lib/servers/description";
import { serverDraftAddresses, type ServerDraft } from "@/lib/servers/draft-progress";
import type { ServerAccessType, ServerAccountMode, ServerAuthMode } from "@/lib/servers/access";
import {
  defaultMinecraftPort,
  MINECRAFT_EDITION_DESCRIPTIONS,
  MINECRAFT_EDITION_LABELS,
  MINECRAFT_PORT_MAX,
  MINECRAFT_PORT_MIN,
  type MinecraftEdition,
} from "@/lib/servers/endpoint-fields";

const logoMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const sectionClass = "grid scroll-mt-20 gap-5";

function validateLogoFile(file: File) {
  if (!logoMimeTypes.has(file.type)) return "Usa una imagen PNG, JPEG o WebP.";
  if (file.size > 4_000_000) return "El archivo original debe pesar 4 MB o menos.";
  return null;
}

function fileSizeLabel(size: number) {
  return `${Math.max(1, Math.round(size / 1024)).toLocaleString("es-ES")} KB`;
}

function FieldHeader({ htmlFor, label, required = false, meta }: { htmlFor: string; label: string; required?: boolean; meta?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <FieldLabel htmlFor={htmlFor}>{label}{required ? <span aria-hidden="true" className="text-primary">*</span> : null}</FieldLabel>
      {meta ? <span className="shrink-0 text-xs font-medium text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

function SubmitButton({ disabled = false, busy = false }: { disabled?: boolean; busy?: boolean }) {
  const { pending } = useFormStatus();
  const isBusy = pending || busy;
  return <Button type="submit" size="lg" disabled={isBusy || disabled}>{pending ? "Creando servidor…" : busy ? "Subiendo logo…" : "Crear servidor"}{!isBusy ? <ArrowRight className="size-4" /> : null}</Button>;
}

function EditionPortFields({ edition, enabled, port, onEnabledChange, onPortChange }: { edition: MinecraftEdition; enabled: boolean; port: string; onEnabledChange: (enabled: boolean) => void; onPortChange: (port: string) => void }) {
  const label = MINECRAFT_EDITION_LABELS[edition];
  const defaultPort = defaultMinecraftPort(edition);
  const Icon = edition === "java" ? Monitor : Smartphone;
  return (
    <div className={`rounded-lg border p-4 transition-colors ${enabled ? "border-primary/30 bg-primary/5" : "bg-muted/20"}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${edition}-enabled`} className={`text-sm font-semibold ${enabled ? "" : "text-muted-foreground"}`}>{label}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{MINECRAFT_EDITION_DESCRIPTIONS[edition]}</p>
        </div>
        <Switch id={`${edition}-enabled`} name={`${edition}Enabled`} checked={enabled} onCheckedChange={(value) => onEnabledChange(value === true)} />
      </div>
      {enabled
        ? <div className="mt-4 flex items-end gap-3 border-t border-primary/20 pt-4"><Field className="w-35 shrink-0"><FieldLabel htmlFor={`${edition}-port`}>Puerto</FieldLabel><Input id={`${edition}-port`} name={`${edition}Port`} type="number" inputMode="numeric" min={MINECRAFT_PORT_MIN} max={MINECRAFT_PORT_MAX} value={port} onChange={(event) => onPortChange(event.target.value)} required className="tabular-nums" /></Field><p className="min-w-0 pb-2 text-xs text-muted-foreground">{Number(port) === defaultPort ? "Puerto predeterminado" : `Predeterminado: ${defaultPort}`}</p></div>
        : <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs leading-4 text-muted-foreground">Actívalo para publicar su puerto de conexión. Se propone {defaultPort} por defecto.</p>}
    </div>
  );
}

function DraftAddresses({ draft }: { draft: ServerDraft }) {
  const addresses = serverDraftAddresses(draft);
  const editions: MinecraftEdition[] = ["java", "bedrock"];
  return (
    <div className="rounded-lg border bg-muted/40 p-3.5">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Direcciones que verán los jugadores</p>
      <div className="mt-2.5 grid gap-2">
        {editions.map((edition) => {
          const entry = addresses.find((item) => item.edition === edition);
          const enabled = edition === "java" ? draft.javaEnabled : draft.bedrockEnabled;
          const reason = !enabled ? "edición desactivada" : !draft.host.trim() ? "falta el host" : "revisa el puerto";
          return (
            <div key={edition} className="flex items-center gap-2.5">
              <Badge variant="outline" className={`w-18 shrink-0 justify-center ${entry ? "" : "text-muted-foreground"}`}>{MINECRAFT_EDITION_LABELS[edition]}</Badge>
              {entry
                ? <div className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border bg-background pl-2.5 pr-1"><code className="min-w-0 flex-1 truncate font-mono text-xs">{entry.address}</code><CopyAddressButton value={entry.address} iconOnly className="-mr-0.5 size-6" /></div>
                : <span className="min-w-0 truncate text-xs text-muted-foreground">Sin publicar · {reason}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServerForm() {
  const [state, formAction] = useActionState<CreateServerState | null, FormData>(createServerAction, null);
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [host, setHost] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [javaEnabled, setJavaEnabled] = useState(true);
  const [javaPort, setJavaPort] = useState(String(defaultMinecraftPort("java")));
  const [bedrockEnabled, setBedrockEnabled] = useState(false);
  const [bedrockPort, setBedrockPort] = useState(String(defaultMinecraftPort("bedrock")));
  const [access, setAccess] = useState<{ accessType: ServerAccessType; accountMode: ServerAccountMode; authMode: ServerAuthMode }>({ accessType: "open", accountMode: "premium_only", authMode: "direct" });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const processedServerId = useRef<string | null>(null);
  const draft: ServerDraft = { name, host, javaEnabled, javaPort, bedrockEnabled, bedrockPort, logoName: logoFile?.name ?? null };

  useEffect(() => {
    if (!logoFile) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => { if (!cancelled && typeof reader.result === "string") setLogoPreview(reader.result); };
    reader.readAsDataURL(logoFile);
    return () => { cancelled = true; reader.abort(); };
  }, [logoFile]);

  useEffect(() => {
    const created = state?.created;
    if (!created || processedServerId.current === created.id) return;
    processedServerId.current = created.id;
    const createdId = created.id;
    const createdSlug = created.slug;
    const selectedLogo = logoFile;
    if (!selectedLogo) { router.push(`/servers/${createdSlug}/manage?created=1`); return; }
    let cancelled = false;
    async function uploadLogo(file: File) {
      setLogoUploading(true);
      const body = new FormData();
      body.set("kind", "logo");
      body.set("file", file);
      try {
        const response = await fetch(`/api/servers/${createdId}/media`, { method: "POST", body });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "No se pudo subir el logo.");
        if (!cancelled) { setLogoUploading(false); router.push(`/servers/${createdSlug}/manage?created=1`); }
      } catch (error) {
        if (!cancelled) { setLogoUploading(false); setLogoError(error instanceof Error ? error.message : "No se pudo subir el logo."); }
      }
    }
    void uploadLogo(selectedLogo);
    return () => { cancelled = true; };
  }, [logoFile, router, state?.created]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setLogoPreview(null);
    setLogoFile(file);
    setLogoError(file ? validateLogoFile(file) : null);
  }

  function clearLogo() {
    if (logoInputRef.current) logoInputRef.current.value = "";
    setLogoPreview(null);
    setLogoFile(null);
    setLogoError(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <ServerDraftRail draft={draft} description={description} tags={tags} logoPreview={logoPreview} accessType={access.accessType} accountMode={access.accountMode} />

      <form action={formAction}>
        <Card>
          <CardContent className="grid gap-6 p-5 sm:p-6">
            <section className={sectionClass} aria-labelledby="identity-heading"><SectionHeading number="01 · Identidad" icon={<FileText className="size-4" />} id="identity-heading" title="Identidad y enlaces" description="Cuenta qué hace especial a tu comunidad y dónde encontrarla." requirement="required" /><div className="grid gap-4"><Field><FieldHeader htmlFor="server-name" label="Nombre" required meta="3–80 caracteres" /><Input id="server-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={80} autoComplete="organization" /><UiFieldError>{state?.fieldErrors?.name}</UiFieldError></Field><Field><FieldHeader htmlFor="server-description" label="Descripción" meta={<span className="tabular-nums">{description.length.toLocaleString("es-ES")} / {SERVER_DESCRIPTION_MAX_LENGTH.toLocaleString("es-ES")}</span>} /><Textarea id="server-description" name="description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={SERVER_DESCRIPTION_MAX_LENGTH} aria-describedby="server-description-help" placeholder="Describe el estilo de juego, la comunidad y lo que encontrarán los jugadores." /><FieldDescription id="server-description-help">Los saltos de línea repetidos se compactan al guardar.</FieldDescription><UiFieldError>{state?.fieldErrors?.description}</UiFieldError></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldHeader htmlFor="website-url" label="Sitio web" meta="Opcional" /><Input id="website-url" name="websiteUrl" type="url" placeholder="https://example.com" /><UiFieldError>{state?.fieldErrors?.websiteUrl}</UiFieldError></Field><Field><FieldHeader htmlFor="store-url" label="Tienda del servidor" meta="Opcional" /><Input id="store-url" name="storeUrl" type="url" placeholder="https://shop.example.com" /><UiFieldError>{state?.fieldErrors?.storeUrl}</UiFieldError></Field><Field><FieldHeader htmlFor="discord-url" label="Invitación de Discord" meta="Opcional" /><Input id="discord-url" name="discordUrl" type="url" placeholder="https://discord.gg/example" /><UiFieldError>{state?.fieldErrors?.discordUrl}</UiFieldError></Field><div><TagCombobox name="tags" label="Etiquetas" meta={<span className="tabular-nums">{tags.length} / 8</span>} onSelectedChange={setTags} /><UiFieldError>{state?.fieldErrors?.tags}</UiFieldError></div></div></div></section>
            <Separator />
            <section className={sectionClass} aria-labelledby="logo-heading"><SectionHeading number="02 · Imagen" icon={<ImageIcon className="size-4" />} id="logo-heading" title="Logo del servidor" description="Ayuda a los jugadores a reconocer tu comunidad en el directorio y en su ficha pública." requirement="optional" /><div className="rounded-lg border border-dashed p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><Avatar className="size-20 shrink-0 rounded-lg bg-card"><AvatarImage src={logoPreview ?? undefined} alt="Vista previa del logo seleccionado" className="rounded-lg object-contain p-2" /><AvatarFallback aria-hidden="true" className="rounded-lg bg-primary/10 text-primary"><ImageIcon className="size-7" /></AvatarFallback></Avatar><Field className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><FieldLabel htmlFor="server-logo">{logoFile ? "Cambiar logo" : "Elegir logo"}</FieldLabel>{logoFile ? <Button type="button" variant="ghost" size="xs" onClick={clearLogo}>Quitar</Button> : null}</div><Input ref={logoInputRef} id="server-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} aria-describedby="server-logo-help" aria-invalid={Boolean(logoError)} />{logoFile && !logoError ? <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="shrink-0 text-[0.625rem]"><Check aria-hidden="true" className="size-3" />Listo</Badge><span className="truncate">{logoFile.name} · {fileSizeLabel(logoFile.size)}</span></p> : null}<FieldDescription id="server-logo-help">PNG, JPEG o WebP · máximo 4 MB. Se optimiza automáticamente y no se usan banners.</FieldDescription></Field></div></div>{logoError ? <UiFieldError>{logoError}</UiFieldError> : null}</section>
            <Separator />
            <section className={sectionClass} aria-labelledby="endpoints-heading"><SectionHeading number="03 · Conexión" icon={<Link2 className="size-4" />} id="endpoints-heading" title="Conexión del servidor" description="Usa un único host compartido y activa los puertos de las ediciones disponibles." requirement="required" /><Field><FieldHeader htmlFor="server-host" label="Host compartido" required meta="Dominio o IP" /><Input id="server-host" name="host" value={host} onChange={(event) => setHost(event.target.value)} required placeholder="play.example.com" autoComplete="url" /><FieldDescription>El mismo dominio o IP se utilizará para Java y Bedrock.</FieldDescription><UiFieldError>{state?.fieldErrors?.endpoints}</UiFieldError></Field><div className="grid gap-3 sm:grid-cols-2"><EditionPortFields edition="java" enabled={javaEnabled} port={javaPort} onEnabledChange={setJavaEnabled} onPortChange={setJavaPort} /><EditionPortFields edition="bedrock" enabled={bedrockEnabled} port={bedrockPort} onEnabledChange={setBedrockEnabled} onPortChange={setBedrockPort} /></div>{!javaEnabled && !bedrockEnabled ? <Alert variant="destructive"><AlertDescription>Selecciona al menos una edición de Minecraft.</AlertDescription></Alert> : <DraftAddresses draft={draft} />}</section>
            <Separator />
            <ServerAccessFields number="04" errors={state?.fieldErrors} onAccessChange={setAccess} />
            {state?.formError ? <Alert variant="destructive"><AlertDescription>{state.formError}</AlertDescription></Alert> : null}{state?.created && logoError ? <Alert variant="destructive"><AlertDescription>El servidor se ha creado, pero no hemos podido subir el logo. <Link href={`/servers/${state.created.slug}/manage?created=1`} className="font-semibold underline">Abrir el panel</Link></AlertDescription></Alert> : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-sm text-xs leading-4 text-muted-foreground">Se guarda como borrador: podrás revisar y completar la ficha antes de hacerla pública.</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="lg" asChild><Link href="/dashboard/servers">Cancelar</Link></Button>
              <SubmitButton disabled={Boolean(state?.created) || Boolean(logoError)} busy={logoUploading} />
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
