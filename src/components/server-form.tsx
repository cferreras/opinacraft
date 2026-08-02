"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  IconArrowRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconFileText,
  IconLink,
  IconPhoto,
} from "@tabler/icons-react";

import {
  createServerAction,
  type CreateServerState,
} from "@/app/servers/new/actions";
import { TagCombobox } from "@/components/tag-combobox";

const inputClassName = "ui-input mt-2 text-[12px]";
const labelClassName = "ui-field-label";
const logoMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function validateLogoFile(file: File) {
  if (!logoMimeTypes.has(file.type)) return "Usa una imagen PNG, JPEG o WebP.";
  if (file.size > 4_000_000) return "El archivo original debe pesar 4 MB o menos.";
  return null;
}

function SubmitButton({ disabled = false, busy = false }: { disabled?: boolean; busy?: boolean }) {
  const { pending } = useFormStatus();
  const isBusy = pending || busy;

  return (
    <button
      type="submit"
      disabled={isBusy || disabled}
      className="ui-button-primary h-11 px-5 text-[12px]"
    >
      {pending ? "Creando servidor…" : busy ? "Subiendo logo…" : "Crear servidor"}
      {!isBusy ? <IconArrowRight aria-hidden="true" size={15} stroke={1.8} /> : null}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-2 text-[11px] leading-4 text-[#c43b45]">{message}</p>
  ) : null;
}

function SectionHeading({
  number,
  icon,
  id,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  id?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#2d34cf]">
        {icon}
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a86a0]">{number}</p>
        <h2 id={id} className="mt-0.5 text-[16px] font-semibold tracking-[-0.02em] text-[#17202a]">{title}</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#667287]">{description}</p>
      </div>
    </div>
  );
}

function EndpointFields({
  edition,
  enabled,
  onEnabledChange,
}: {
  edition: "java" | "bedrock";
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const defaults = edition === "java"
    ? { name: "Java", port: 25565, description: "Para Minecraft Java Edition", icon: <IconDeviceDesktop aria-hidden="true" size={18} stroke={1.7} /> }
    : { name: "Bedrock", port: 19132, description: "Para Minecraft Bedrock Edition", icon: <IconDeviceMobile aria-hidden="true" size={18} stroke={1.7} /> };

  return (
    <fieldset className={`rounded-xl border p-4 transition-colors ${enabled ? "border-[#cbd2ff] bg-[#fbfcff]" : "border-[#e1e6e9] bg-white"}`}>
      <legend className="sr-only">{defaults.name}</legend>
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${edition === "java" ? "bg-[#eef0ff] text-[#2c3be2]" : "bg-[#e9f8ff] text-[#168fca]"}`}>
          {defaults.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#1b2638]">{defaults.name}</p>
              <p className="mt-0.5 text-[10px] text-[#7a8698]">{defaults.description}</p>
            </div>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 self-start rounded-lg border border-[#dce2e7] bg-white px-2.5 text-[11px] font-medium text-[#35415b] transition hover:border-[#bfc8d4]">
              <input
                type="checkbox"
                name={`${edition}Enabled`}
                checked={enabled}
                onChange={(event) => onEnabledChange(event.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-[#bdc7d1] accent-[#3029e7]"
              />
              Activar {defaults.name}
            </label>
          </div>

          {enabled ? (
            <div className="mt-4 grid gap-4 border-t border-[#e6eaf1] pt-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <label className={labelClassName}>
                Host
                <input
                  name={`${edition}Host`}
                  type="text"
                  required={enabled}
                  placeholder="play.example.com"
                  autoComplete="url"
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Puerto
                <input
                  name={`${edition}Port`}
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={defaults.port}
                  required={enabled}
                  className={inputClassName}
                />
              </label>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-[#f5f7f9] px-3 py-2 text-[10px] leading-4 text-[#7a8698]">
              Activa esta edición para mostrar una dirección de conexión adicional.
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

export function ServerForm() {
  const [state, formAction] = useActionState<CreateServerState | null, FormData>(
    createServerAction,
    null,
  );
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
    reader.onload = () => {
      if (!cancelled && typeof reader.result === "string") setLogoPreview(reader.result);
    };
    reader.readAsDataURL(logoFile);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [logoFile]);

  useEffect(() => {
    const created = state?.created;
    if (!created || processedServerId.current === created.id) return;
    processedServerId.current = created.id;
    const createdServer = created;
    const selectedLogo = logoFile;

    if (!selectedLogo) {
      router.push(`/servers/${createdServer.slug}/manage?created=1`);
      return;
    }

    let cancelled = false;

    async function uploadLogo(file: File) {
      setLogoUploading(true);
      const body = new FormData();
      body.set("kind", "logo");
      body.set("file", file);

      try {
        const response = await fetch(`/api/servers/${createdServer.id}/media`, {
          method: "POST",
          body,
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? "No se pudo subir el logo.");
        }
        if (!cancelled) {
          setLogoUploading(false);
          router.push(`/servers/${createdServer.slug}/manage?created=1`);
        }
      } catch (error) {
        if (!cancelled) {
          setLogoUploading(false);
          setLogoError(error instanceof Error ? error.message : "No se pudo subir el logo.");
        }
      }
    }

    void uploadLogo(selectedLogo);
    return () => {
      cancelled = true;
    };
  }, [logoFile, router, state?.created]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setLogoPreview(null);
    setLogoFile(file);
    setLogoError(file ? validateLogoFile(file) : null);
  }

  return (
    <form action={formAction} className="space-y-7">
      <section className="space-y-5" aria-labelledby="identity-heading">
        <SectionHeading
          number="01 · Identidad"
          icon={<IconFileText aria-hidden="true" size={18} stroke={1.7} />}
          id="identity-heading"
          title="Identidad y enlaces"
          description="Cuenta qué hace especial a tu comunidad y dónde encontrarla."
        />

        <div className="grid gap-4">
          <label className={labelClassName}>
            Nombre
            <input
              name="name"
              type="text"
              required
              minLength={3}
              maxLength={80}
              autoComplete="organization"
              className={inputClassName}
            />
            <FieldError message={state?.fieldErrors?.name} />
          </label>

          <label className={labelClassName}>
            Descripción
            <textarea
              name="description"
              rows={5}
              maxLength={2000}
              placeholder="Describe el estilo de juego, la comunidad y lo que encontrarán los jugadores."
              className="ui-textarea mt-2 min-h-[126px] text-[12px]"
            />
            <FieldError message={state?.fieldErrors?.description} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClassName}>
              Sitio web
              <input
                name="websiteUrl"
                type="url"
                placeholder="https://example.com"
                className={inputClassName}
              />
              <FieldError message={state?.fieldErrors?.websiteUrl} />
            </label>
            <label className={labelClassName}>
              Tienda del servidor
              <input
                name="storeUrl"
                type="url"
                placeholder="https://shop.example.com"
                autoComplete="url"
                className={inputClassName}
              />
              <FieldError message={state?.fieldErrors?.storeUrl} />
            </label>
            <label className={labelClassName}>
              Invitación de Discord
              <input
                name="discordUrl"
                type="url"
                placeholder="https://discord.gg/example"
                className={inputClassName}
              />
              <FieldError message={state?.fieldErrors?.discordUrl} />
            </label>
            <label className={labelClassName}>
              Etiquetas
              <TagCombobox name="tags" />
              <FieldError message={state?.fieldErrors?.tags} />
            </label>
          </div>
        </div>
      </section>

      <div className="border-t border-[#e7ebef]" />

      <section className="space-y-5" aria-labelledby="logo-heading">
        <SectionHeading
          number="02 · Imagen"
          icon={<IconPhoto aria-hidden="true" size={18} stroke={1.7} />}
          id="logo-heading"
          title="Logo del servidor"
          description="Ayuda a los jugadores a reconocer tu comunidad en el directorio y en su ficha pública."
        />

        <div className="rounded-xl border border-dashed border-[#cfd6df] bg-[#fbfcff] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {logoPreview ? (
              <img src={logoPreview} alt="Vista previa del logo seleccionado" className="h-20 w-20 shrink-0 rounded-xl border border-[#e1e6eb] bg-white object-contain p-2" />
            ) : (
              <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-[#e0e5ff] bg-[#f0f1ff] text-[#4655e8]">
                <IconPhoto aria-hidden="true" size={28} stroke={1.5} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-[#35415b]">Añade el logo de tu comunidad</p>
              <p id="server-logo-help" className="mt-1 text-[10px] leading-4 text-[#718097]">PNG, JPEG o WebP · máximo 4 MB. Se optimizará automáticamente a WebP.</p>
              <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-[#cbd2ff] bg-white px-3 text-[11px] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff]">
                {logoFile ? "Cambiar logo" : "Elegir logo"}
                <input
                  id="server-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoChange}
                  aria-describedby="server-logo-help"
                  aria-invalid={Boolean(logoError)}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
          <p className="mt-4 rounded-lg bg-[#f5f7f9] px-3 py-2 text-[10px] leading-4 text-[#718097]">El logo es opcional. Esta publicación no utiliza banners.</p>
        </div>
        <FieldError message={logoError ?? undefined} />
      </section>

      <div className="border-t border-[#e7ebef]" />

      <section className="space-y-5" aria-labelledby="endpoints-heading">
        <SectionHeading
          number="03 · Conexión"
          icon={<IconLink aria-hidden="true" size={18} stroke={1.7} />}
          id="endpoints-heading"
          title="Direcciones del servidor"
          description="Añade al menos una dirección pública. Los puertos habituales ya están preparados."
        />

        <div className="grid gap-3">
          <EndpointFields
            edition="java"
            enabled={javaEnabled}
            onEnabledChange={setJavaEnabled}
          />
          <EndpointFields
            edition="bedrock"
            enabled={bedrockEnabled}
            onEnabledChange={setBedrockEnabled}
          />
        </div>
        <FieldError message={state?.fieldErrors?.endpoints} />
        {!javaEnabled && !bedrockEnabled ? (
          <p role="alert" className="rounded-lg bg-[#fff3f3] px-3 py-2 text-[11px] leading-4 text-[#c43b45]">
            Selecciona al menos una edición de Minecraft.
          </p>
        ) : null}
      </section>

      {state?.formError ? (
        <p role="alert" className="rounded-lg border border-[#f2cfd2] bg-[#fff3f3] px-3 py-2.5 text-[11px] leading-5 text-[#c43b45]">
          {state.formError}
        </p>
      ) : null}

      {state?.created && logoError ? (
        <p role="alert" className="rounded-lg border border-[#f2cfd2] bg-[#fff3f3] px-3 py-2.5 text-[11px] leading-5 text-[#c43b45]">
          El servidor se ha creado, pero no hemos podido subir el logo. <Link href={`/servers/${state.created.slug}/manage?created=1`} className="font-semibold underline underline-offset-2">Abrir el panel para intentarlo de nuevo.</Link>
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-[#e7ebef] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[270px] text-[10px] leading-4 text-[#7a8698]">Podrás revisar y completar la ficha antes de hacerla pública.</p>
        <div className="flex items-center justify-end gap-2">
          <Link href="/dashboard/servers" className="inline-flex h-10 items-center rounded-lg border border-[#dce2e7] px-3.5 text-[11px] font-semibold text-[#59677c] transition hover:border-[#bdc6d1] hover:bg-[#f7f8fa]">
            Cancelar
          </Link>
          <SubmitButton disabled={Boolean(state?.created) || Boolean(logoError)} busy={logoUploading} />
        </div>
      </div>
    </form>
  );
}
