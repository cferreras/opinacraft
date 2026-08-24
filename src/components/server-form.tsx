"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ArrowRight, FileText, Image as ImageIcon, Link2, Monitor, Smartphone } from "lucide-react";

import { createServerAction, type CreateServerState } from "@/app/servers/new/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError as UiFieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/section-heading";
import { ServerAccessFields } from "@/components/server-access-fields";
import { TagCombobox } from "@/components/tag-combobox";
import { SERVER_DESCRIPTION_MAX_LENGTH } from "@/lib/servers/description";
import {
  defaultMinecraftPort,
  MINECRAFT_EDITION_DESCRIPTIONS,
  MINECRAFT_EDITION_LABELS,
  MINECRAFT_PORT_MAX,
  MINECRAFT_PORT_MIN,
} from "@/lib/servers/endpoint-fields";

const logoMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function validateLogoFile(file: File) {
  if (!logoMimeTypes.has(file.type)) return "Usa una imagen PNG, JPEG o WebP.";
  if (file.size > 4_000_000) return "El archivo original debe pesar 4 MB o menos.";
  return null;
}

function SubmitButton({ disabled = false, busy = false }: { disabled?: boolean; busy?: boolean }) {
  const { pending } = useFormStatus();
  const isBusy = pending || busy;
  return <Button type="submit" disabled={isBusy || disabled}>{pending ? "Creando servidor…" : busy ? "Subiendo logo…" : "Crear servidor"}{!isBusy ? <ArrowRight className="size-4" /> : null}</Button>;
}

function EditionPortFields({ edition, enabled, onEnabledChange }: { edition: "java" | "bedrock"; enabled: boolean; onEnabledChange: (enabled: boolean) => void }) {
  const java = edition === "java";
  const label = MINECRAFT_EDITION_LABELS[edition];
  const description = MINECRAFT_EDITION_DESCRIPTIONS[edition];
  const defaultPort = defaultMinecraftPort(edition);
  return (
    <fieldset className={`rounded-lg border p-4 transition-colors ${enabled ? "border-primary/30 bg-primary/5" : "bg-muted/20"}`}>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{java ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 self-start rounded-md border bg-background px-2.5 text-xs font-medium"><Checkbox name={`${edition}Enabled`} checked={enabled} onCheckedChange={(value) => onEnabledChange(value === true)} />Activar {label}</label>
          </div>
          {enabled ? <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_8.75rem]"><Field><FieldLabel htmlFor={`${edition}-port`}>Puerto {label}</FieldLabel><Input id={`${edition}-port`} name={`${edition}Port`} type="number" min={MINECRAFT_PORT_MIN} max={MINECRAFT_PORT_MAX} defaultValue={defaultPort} required /></Field></div> : <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs leading-4 text-muted-foreground">Activa esta edición para añadir su puerto de conexión.</p>}
        </div>
      </div>
    </fieldset>
  );
}

export function ServerForm() {
  const [state, formAction] = useActionState<CreateServerState | null, FormData>(createServerAction, null);
  const router = useRouter();
  const [javaEnabled, setJavaEnabled] = useState(true);
  const [bedrockEnabled, setBedrockEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const processedServerId = useRef<string | null>(null);

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

  return (
    <form action={formAction} className="grid gap-7">
      <Card><CardContent className="grid gap-6 p-5 sm:p-6">
        <section className="grid gap-5" aria-labelledby="identity-heading"><SectionHeading number="01 · Identidad" icon={<FileText className="size-4" />} id="identity-heading" title="Identidad y enlaces" description="Cuenta qué hace especial a tu comunidad y dónde encontrarla." /><div className="grid gap-4"><Field><FieldLabel htmlFor="server-name">Nombre</FieldLabel><Input id="server-name" name="name" required minLength={3} maxLength={80} autoComplete="organization" /><UiFieldError>{state?.fieldErrors?.name}</UiFieldError></Field><Field><FieldLabel htmlFor="server-description">Descripción</FieldLabel><Textarea id="server-description" name="description" rows={5} maxLength={SERVER_DESCRIPTION_MAX_LENGTH} aria-describedby="server-description-help" placeholder="Describe el estilo de juego, la comunidad y lo que encontrarán los jugadores." /><FieldDescription id="server-description-help">Máximo 2.000 caracteres. Los saltos de línea repetidos se compactan al guardar.</FieldDescription><UiFieldError>{state?.fieldErrors?.description}</UiFieldError></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="website-url">Sitio web</FieldLabel><Input id="website-url" name="websiteUrl" type="url" placeholder="https://example.com" /><UiFieldError>{state?.fieldErrors?.websiteUrl}</UiFieldError></Field><Field><FieldLabel htmlFor="store-url">Tienda del servidor</FieldLabel><Input id="store-url" name="storeUrl" type="url" placeholder="https://shop.example.com" /><UiFieldError>{state?.fieldErrors?.storeUrl}</UiFieldError></Field><Field><FieldLabel htmlFor="discord-url">Invitación de Discord</FieldLabel><Input id="discord-url" name="discordUrl" type="url" placeholder="https://discord.gg/example" /><UiFieldError>{state?.fieldErrors?.discordUrl}</UiFieldError></Field><div><TagCombobox name="tags" label="Etiquetas" /><UiFieldError>{state?.fieldErrors?.tags}</UiFieldError></div></div></div></section>
        <Separator />
        <section className="grid gap-5" aria-labelledby="logo-heading"><SectionHeading number="02 · Imagen" icon={<ImageIcon className="size-4" />} id="logo-heading" title="Logo del servidor" description="Ayuda a los jugadores a reconocer tu comunidad en el directorio y en su ficha pública." /><div className="rounded-lg border border-dashed p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center">{logoPreview ? <img src={logoPreview} alt="Vista previa del logo seleccionado" className="size-20 shrink-0 rounded-lg border bg-background object-contain p-2" /> : <span className="inline-flex size-20 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary"><ImageIcon className="size-7" /></span>}<Field className="min-w-0 flex-1"><FieldLabel htmlFor="server-logo">{logoFile ? "Cambiar logo" : "Elegir logo"}</FieldLabel><Input id="server-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} aria-describedby="server-logo-help" aria-invalid={Boolean(logoError)} /><FieldDescription id="server-logo-help">PNG, JPEG o WebP · máximo 4 MB. Se optimizará automáticamente.</FieldDescription></Field></div><p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">El logo es opcional. Esta publicación no utiliza banners.</p></div>{logoError ? <UiFieldError>{logoError}</UiFieldError> : null}</section>
        <Separator />
        <section className="grid gap-5" aria-labelledby="endpoints-heading"><SectionHeading number="03 · Conexión" icon={<Link2 className="size-4" />} id="endpoints-heading" title="Conexión del servidor" description="Usa un único host compartido y activa los puertos de las ediciones disponibles." /><Field><FieldLabel htmlFor="server-host">Host compartido</FieldLabel><Input id="server-host" name="host" required placeholder="play.example.com" autoComplete="url" /><FieldDescription>El mismo dominio o IP se utilizará para Java y Bedrock.</FieldDescription><UiFieldError>{state?.fieldErrors?.endpoints}</UiFieldError></Field><div className="grid gap-3"><EditionPortFields edition="java" enabled={javaEnabled} onEnabledChange={setJavaEnabled} /><EditionPortFields edition="bedrock" enabled={bedrockEnabled} onEnabledChange={setBedrockEnabled} /></div>{!javaEnabled && !bedrockEnabled ? <Alert variant="destructive"><AlertDescription>Selecciona al menos una edición de Minecraft.</AlertDescription></Alert> : null}</section>
        <Separator />
        <ServerAccessFields number="04" errors={state?.fieldErrors} />
        {state?.formError ? <Alert variant="destructive"><AlertDescription>{state.formError}</AlertDescription></Alert> : null}{state?.created && logoError ? <Alert variant="destructive"><AlertDescription>El servidor se ha creado, pero no hemos podido subir el logo. <Link href={`/servers/${state.created.slug}/manage?created=1`} className="font-semibold underline">Abrir el panel</Link></AlertDescription></Alert> : null}
        <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xs text-xs text-muted-foreground">Podrás revisar y completar la ficha antes de hacerla pública.</p><div className="flex items-center justify-end gap-2"><Button variant="outline" asChild><Link href="/dashboard/servers">Cancelar</Link></Button><SubmitButton disabled={Boolean(state?.created) || Boolean(logoError)} busy={logoUploading} /></div></div>
      </CardContent></Card>
    </form>
  );
}
