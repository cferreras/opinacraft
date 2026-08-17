"use client";

import { useState } from "react";
import { ClipboardCheck, KeyRound, LockKeyhole, ShieldCheck, Unlock } from "lucide-react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/section-heading";
import {
  accessProfileKey,
  serverAccessProfiles,
  type ServerAccessType,
  type ServerAccountMode,
  type ServerAuthMode,
} from "@/lib/servers/access";

type AccessErrors = Partial<Record<"accessType" | "accessFormUrl" | "accountMode" | "authMode", string>>;

type ServerAccessFieldsProps = {
  number: string;
  initialAccessType?: ServerAccessType;
  initialAccessFormUrl?: string | null;
  initialAccountMode?: ServerAccountMode;
  initialAuthMode?: ServerAuthMode;
  errors?: AccessErrors;
};

const accessOptions = [
  { value: "open" as const, label: "Acceso abierto", description: "Cualquier jugador puede entrar sin solicitar plaza.", icon: <Unlock aria-hidden="true" className="size-4" /> },
  { value: "whitelist" as const, label: "Con whitelist", description: "El equipo aprueba quién puede entrar al servidor.", icon: <ClipboardCheck aria-hidden="true" className="size-4" /> },
];

export function ServerAccessFields({
  number,
  initialAccessType = "open",
  initialAccessFormUrl = null,
  initialAccountMode = "premium_only",
  initialAuthMode = "direct",
  errors,
}: ServerAccessFieldsProps) {
  const [accessType, setAccessType] = useState<ServerAccessType>(initialAccessType);
  const [formUrl, setFormUrl] = useState(initialAccessFormUrl ?? "");
  const [profile, setProfile] = useState(accessProfileKey({ accountMode: initialAccountMode, authMode: initialAuthMode }));
  const selectedProfile = serverAccessProfiles.find((option) => accessProfileKey(option) === profile) ?? serverAccessProfiles[0];

  return (
    <section className="grid gap-5" aria-labelledby="access-heading">
      <SectionHeading number={`${number} · Acceso`} icon={<ShieldCheck className="size-4" />} id="access-heading" title="Acceso de jugadores" description="Explica en una mirada si cualquiera puede entrar y qué tipo de cuenta necesita." />
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">Admisión</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {accessOptions.map((option) => {
            const selected = accessType === option.value;
            return (
              <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${selected ? "border-primary/40 bg-primary/5" : "bg-muted/20 hover:bg-muted/40"}`}>
                <input type="radio" name="accessType" value={option.value} checked={selected} onChange={() => setAccessType(option.value)} className="mt-0.5 size-4 accent-primary" />
                <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold">{option.icon}{option.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span></span>
              </label>
            );
          })}
        </div>
        {errors?.accessType ? <FieldError>{errors.accessType}</FieldError> : null}
      </fieldset>
      {accessType === "whitelist" ? <Field><FieldLabel htmlFor="access-form-url">Formulario de acceso <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel><Input id="access-form-url" name="accessFormUrl" type="url" value={formUrl} onChange={(event) => setFormUrl(event.target.value)} placeholder="https://forms.example.com/solicitud" /><FieldDescription>Si lo publicas, aparecerá como enlace “Solicitar acceso” en la ficha pública.</FieldDescription>{errors?.accessFormUrl ? <FieldError>{errors.accessFormUrl}</FieldError> : null}</Field> : null}
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">Cuentas y autenticación</legend>
        <FieldDescription>Elige la descripción que mejor entiende un jugador antes de conectarse.</FieldDescription>
        <input type="hidden" name="accountMode" value={selectedProfile.accountMode} />
        <input type="hidden" name="authMode" value={selectedProfile.authMode} />
        <div className="grid gap-3">
          {serverAccessProfiles.map((option) => {
            const selected = accessProfileKey(option) === profile;
            const icon = option.authMode === "password_all" ? <KeyRound aria-hidden="true" className="size-4" /> : option.accountMode === "premium_only" ? <LockKeyhole aria-hidden="true" className="size-4" /> : <ShieldCheck aria-hidden="true" className="size-4" />;
            return <label key={accessProfileKey(option)} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${selected ? "border-primary/40 bg-primary/5" : "bg-muted/20 hover:bg-muted/40"}`}><input type="radio" name="accessProfile" value={accessProfileKey(option)} checked={selected} onChange={() => setProfile(accessProfileKey(option))} className="mt-0.5 size-4 accent-primary" /><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold">{icon}{option.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span></span></label>;
          })}
        </div>
        {errors?.accountMode ? <FieldError>{errors.accountMode}</FieldError> : null}
        {errors?.authMode ? <FieldError>{errors.authMode}</FieldError> : null}
      </fieldset>
    </section>
  );
}
