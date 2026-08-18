"use client";

import { useActionState } from "react";
import { Link2, Monitor, Save, Smartphone, FileText } from "lucide-react";

import { updateServerAction, type ManageState } from "@/app/servers/[slug]/manage/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/section-heading";
import { ServerAccessFields } from "@/components/server-access-fields";
import { TagCombobox } from "@/components/tag-combobox";
import {
  defaultMinecraftPort,
  MINECRAFT_EDITION_LABELS,
  MINECRAFT_PORT_MAX,
  MINECRAFT_PORT_MIN,
} from "@/lib/servers/endpoint-fields";
import type { ServerManageFormData } from "@/lib/servers/manage-form-data";

export function ServerManageForm({ server }: { server: ServerManageFormData }) {
  const [state, action] = useActionState<ManageState | null, FormData>(updateServerAction, null);
  const java = server.endpoints.find((endpoint) => endpoint.edition === "java");
  const bedrock = server.endpoints.find((endpoint) => endpoint.edition === "bedrock");
  const sharedHost = java?.host ?? bedrock?.host ?? "";
  const canEditName = server.role !== "editor";
  const canEditEndpoints = server.role !== "editor";
  const canPublish = server.role === "owner";

  return <form action={action}><input type="hidden" name="serverId" value={server.id} /><input type="hidden" name="slug" value={server.slug} /><Card><CardContent className="grid gap-7 p-5 sm:p-6"><section className="grid gap-5" aria-labelledby="identity-heading"><SectionHeading number="01 · Identidad" icon={<FileText className="size-4" />} id="identity-heading" title="Identidad y enlaces" description="Cuenta qué hace especial a tu comunidad y dónde encontrarla." /><div className="grid gap-4"><Field><FieldLabel htmlFor="manage-name">Nombre</FieldLabel>{!canEditName ? <input type="hidden" name="name" value={server.name} /> : null}<Input id="manage-name" name="name" defaultValue={server.name} required minLength={3} maxLength={80} disabled={!canEditName} />{state?.fieldErrors?.name ? <ErrorText>{state.fieldErrors.name}</ErrorText> : null}</Field><Field><FieldLabel htmlFor="manage-description">Descripción</FieldLabel><Textarea id="manage-description" name="description" defaultValue={server.description ?? ""} maxLength={2_000} rows={5} placeholder="Describe el estilo de juego, la comunidad y lo que encontrarán los jugadores." />{state?.fieldErrors?.description ? <ErrorText>{state.fieldErrors.description}</ErrorText> : null}</Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="manage-website">Sitio web</FieldLabel><Input id="manage-website" name="websiteUrl" type="url" defaultValue={server.websiteUrl ?? ""} placeholder="https://example.com" />{state?.fieldErrors?.websiteUrl ? <ErrorText>{state.fieldErrors.websiteUrl}</ErrorText> : null}</Field><Field><FieldLabel htmlFor="manage-store">Tienda del servidor</FieldLabel><Input id="manage-store" name="storeUrl" type="url" defaultValue={server.storeUrl ?? ""} placeholder="https://shop.example.com" />{state?.fieldErrors?.storeUrl ? <ErrorText>{state.fieldErrors.storeUrl}</ErrorText> : null}</Field><Field><FieldLabel htmlFor="manage-discord">Invitación de Discord</FieldLabel><Input id="manage-discord" name="discordUrl" type="url" defaultValue={server.discordUrl ?? ""} placeholder="https://discord.gg/example" />{state?.fieldErrors?.discordUrl ? <ErrorText>{state.fieldErrors.discordUrl}</ErrorText> : null}</Field><div><TagCombobox name="tags" label="Etiquetas" initialTags={server.tags.map((tag) => tag.label)} allowCreate={server.role === "owner"} />{state?.fieldErrors?.tags ? <ErrorText>{state.fieldErrors.tags}</ErrorText> : null}</div></div></div></section><Separator /><section className="grid gap-5" aria-labelledby="endpoints-heading"><SectionHeading number="02 · Conexión" icon={<Link2 className="size-4" />} id="endpoints-heading" title="Conexión del servidor" description="Mantén un único host compartido y configura los puertos de cada edición." /><Field><FieldLabel htmlFor="manage-host">Host compartido</FieldLabel>{!canEditEndpoints ? <input type="hidden" name="host" value={sharedHost} /> : null}<Input id="manage-host" name="host" defaultValue={sharedHost} placeholder="play.example.com" disabled={!canEditEndpoints} required /><FieldDescription>Java y Bedrock utilizan este mismo dominio o IP.</FieldDescription>{state?.fieldErrors?.endpoints ? <ErrorText>{state.fieldErrors.endpoints}</ErrorText> : null}</Field><div className="grid gap-3"><EditionPortFields edition="java" endpoint={java} disabled={!canEditEndpoints} /><EditionPortFields edition="bedrock" endpoint={bedrock} disabled={!canEditEndpoints} /></div></section><Separator /><ServerAccessFields number="03" initialAccessType={server.accessType} initialAccessFormUrl={server.accessFormUrl} initialAccountMode={server.accountMode} initialAuthMode={server.authMode} errors={state?.fieldErrors} /><Separator /><section className="rounded-lg border bg-muted/30 p-4" aria-labelledby="publication-heading"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11.875rem] sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">04 · Visibilidad</p><h3 id="publication-heading" className="mt-1 text-sm font-semibold">Publicación</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Elige si la ficha aparece en el directorio público.</p></div><Field><FieldLabel htmlFor="publication-status" className="sr-only">Publicación</FieldLabel><NativeSelect id="publication-status" name="publicationStatus" defaultValue={server.publicationStatus} disabled={!canPublish} className="w-full"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="hidden">Oculto</option></NativeSelect>{state?.fieldErrors?.publicationStatus ? <ErrorText>{state.fieldErrors.publicationStatus}</ErrorText> : null}</Field></div></section>{state?.formError ? <ErrorText>{state.formError}</ErrorText> : null}<div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-end"><Button type="submit"><Save className="size-4" />Guardar cambios</Button></div></CardContent></Card></form>;
}

function EditionPortFields({ edition, endpoint, disabled }: { edition: "java" | "bedrock"; endpoint?: ServerManageFormData["endpoints"][number]; disabled: boolean }) {
  const java = edition === "java";
  const label = MINECRAFT_EDITION_LABELS[edition];
  const defaultPort = defaultMinecraftPort(edition);
  return <fieldset className={`rounded-lg border p-4 transition-colors ${endpoint ? "border-primary/30 bg-primary/5" : "bg-muted/20"}`}><legend className="sr-only">{label}</legend><div className="flex items-start gap-3"><span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{java ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">Minecraft {label} Edition</p></div><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 self-start rounded-md border bg-background px-2.5 text-xs font-medium">{disabled ? <input type="hidden" name={`${edition}Enabled`} value={endpoint ? "on" : ""} /> : null}<Checkbox name={`${edition}Enabled`} defaultChecked={Boolean(endpoint)} disabled={disabled} /> Activar</label></div><div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_7.5rem]"><Field><FieldLabel htmlFor={`${edition}-manage-port`}>Puerto {label}</FieldLabel>{disabled ? <input type="hidden" name={`${edition}Port`} value={endpoint?.port ?? ""} /> : null}<Input id={`${edition}-manage-port`} name={`${edition}Port`} type="number" min={MINECRAFT_PORT_MIN} max={MINECRAFT_PORT_MAX} defaultValue={endpoint?.port ?? defaultPort} disabled={disabled} required={Boolean(endpoint)} /></Field></div></div></div></fieldset>;
}

function ErrorText({ children }: { children: string }) { return <p role="alert" className="text-sm text-destructive">{children}</p>; }
