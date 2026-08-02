"use client";

import { useActionState } from "react";
import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconFileText,
  IconLink,
} from "@tabler/icons-react";

import {
  updateServerAction,
  type ManageState,
} from "@/app/servers/[slug]/manage/actions";
import { SectionHeading } from "@/components/section-heading";
import { TagCombobox } from "@/components/tag-combobox";

type Endpoint = { edition: "java" | "bedrock"; host: string; port: number };

const inputClassName = "ui-input mt-2 text-[12px] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 disabled:opacity-100";
const labelClassName = "ui-field-label";

export function ServerManageForm({
  server,
}: {
  server: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    websiteUrl: string | null;
    storeUrl: string | null;
    discordUrl: string | null;
    tags: Array<{ label: string; slug: string }>;
    publicationStatus: "draft" | "published" | "hidden";
    endpoints: Endpoint[];
    role: "owner" | "admin" | "editor";
  };
}) {
  const [state, action] = useActionState<ManageState | null, FormData>(
    updateServerAction,
    null,
  );
  const java = server.endpoints.find((endpoint) => endpoint.edition === "java");
  const bedrock = server.endpoints.find((endpoint) => endpoint.edition === "bedrock");
  const canEditName = server.role !== "editor";
  const canEditEndpoints = server.role !== "editor";
  const canPublish = server.role === "owner";

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="serverId" value={server.id} />
      <input type="hidden" name="slug" value={server.slug} />

      <section className="space-y-5" aria-labelledby="identity-heading">
        <SectionHeading
          number="01 / Identity"
          icon={<IconFileText aria-hidden="true" size={17} stroke={1.7} />}
          id="identity-heading"
          title="Identity and links"
          description="Tell players what makes this community worth joining and where to find it."
        />

        <div className="grid gap-4">
          <label className={labelClassName}>
            Name
            {!canEditName ? <input type="hidden" name="name" value={server.name} /> : null}
            <input name="name" defaultValue={server.name} required minLength={3} maxLength={80} disabled={!canEditName} className={inputClassName} />
            {state?.fieldErrors?.name ? <ErrorText>{state.fieldErrors.name}</ErrorText> : null}
          </label>

          <label className={labelClassName}>
            Description
            <textarea name="description" defaultValue={server.description ?? ""} maxLength={2000} rows={5} placeholder="Describe the play style, community and what players will find." className={`${inputClassName} h-auto min-h-[126px] resize-y py-3 leading-5`} />
            {state?.fieldErrors?.description ? <ErrorText>{state.fieldErrors.description}</ErrorText> : null}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClassName}>
              Website URL
              <input name="websiteUrl" type="url" defaultValue={server.websiteUrl ?? ""} placeholder="https://example.com" className={inputClassName} />
              {state?.fieldErrors?.websiteUrl ? <ErrorText>{state.fieldErrors.websiteUrl}</ErrorText> : null}
            </label>
            <label className={labelClassName}>
              Store URL
              <input name="storeUrl" type="url" defaultValue={server.storeUrl ?? ""} placeholder="https://shop.example.com" className={inputClassName} />
              {state?.fieldErrors?.storeUrl ? <ErrorText>{state.fieldErrors.storeUrl}</ErrorText> : null}
            </label>
            <label className={labelClassName}>
              Discord invite URL
              <input name="discordUrl" type="url" defaultValue={server.discordUrl ?? ""} placeholder="https://discord.gg/example" className={inputClassName} />
              {state?.fieldErrors?.discordUrl ? <ErrorText>{state.fieldErrors.discordUrl}</ErrorText> : null}
            </label>
            <label className={labelClassName}>
              Tags
              <TagCombobox name="tags" initialTags={server.tags.map((tag) => tag.label)} allowCreate={server.role === "owner"} />
              {state?.fieldErrors?.tags ? <ErrorText>{state.fieldErrors.tags}</ErrorText> : null}
            </label>
          </div>
        </div>
      </section>

      <div className="border-t border-[#e7ebef]" />

      <section className="space-y-5" aria-labelledby="endpoints-heading">
        <SectionHeading
          number="02 / Connection"
          icon={<IconLink aria-hidden="true" size={17} stroke={1.7} />}
          id="endpoints-heading"
          title="Server addresses"
          description="Keep at least one public address connected to the listing."
        />

        <div className="grid gap-3">
          <EndpointFields edition="java" endpoint={java} disabled={!canEditEndpoints} />
          <EndpointFields edition="bedrock" endpoint={bedrock} disabled={!canEditEndpoints} />
        </div>
        {state?.fieldErrors?.endpoints ? <ErrorText>{state.fieldErrors.endpoints}</ErrorText> : null}
      </section>

      <div className="border-t border-[#e7ebef]" />

      <section className="rounded-xl border border-[#e4e8ed] bg-[#fbfcff] p-4" aria-labelledby="publication-heading">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a86a0]">03 / Visibility</p>
            <h3 id="publication-heading" className="mt-1 text-[14px] font-semibold text-[#1b2638]">Publication</h3>
            <p className="mt-1 text-[11px] leading-5 text-[#718097]">Choose whether this listing is discoverable in the public directory.</p>
          </div>
          <label className={labelClassName}>
            <span className="sr-only">Publication</span>
            <select name="publicationStatus" aria-label="Publication" defaultValue={server.publicationStatus} disabled={!canPublish} className={`${inputClassName} mt-0 disabled:cursor-not-allowed`}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </select>
            {state?.fieldErrors?.publicationStatus ? <ErrorText>{state.fieldErrors.publicationStatus}</ErrorText> : null}
          </label>
        </div>
      </section>

      {state?.formError ? <ErrorText>{state.formError}</ErrorText> : null}

      <div className="flex flex-col gap-3 border-t border-[#e7ebef] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[280px] text-[10px] leading-4 text-[#7a8698]">Changes update the public server page after they are saved.</p>
        <button type="submit" className="ui-button-primary h-11 px-5 text-[12px]">
          Save changes
        </button>
      </div>
    </form>
  );
}

function EndpointFields({ edition, endpoint, disabled }: { edition: "java" | "bedrock"; endpoint?: Endpoint; disabled: boolean }) {
  const isJava = edition === "java";
  const defaultPort = isJava ? 25565 : 19132;
  const label = isJava ? "Java" : "Bedrock";

  return (
    <fieldset className={`rounded-xl border p-4 transition-colors ${endpoint ? "border-[#cbd2ff] bg-[#fbfcff]" : "border-[#e1e6e9] bg-white"}`}>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isJava ? "bg-[#eef0ff] text-[#2c3be2]" : "bg-[#e9f8ff] text-[#168fca]"}`}>
          {isJava ? <IconDeviceDesktop aria-hidden="true" size={18} stroke={1.7} /> : <IconDeviceMobile aria-hidden="true" size={18} stroke={1.7} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#1b2638]">{label}</p>
              <p className="mt-0.5 text-[10px] text-[#7a8698]">{isJava ? "Minecraft Java Edition" : "Minecraft Bedrock Edition"}</p>
            </div>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 self-start rounded-lg border border-[#dce2e7] bg-white px-2.5 text-[11px] font-medium text-[#35415b] transition hover:border-[#bfc8d4]">
              {disabled ? <input type="hidden" name={`${edition}Enabled`} value={endpoint ? "on" : ""} /> : null}
              <input type="checkbox" name={`${edition}Enabled`} defaultChecked={Boolean(endpoint)} disabled={disabled} className="h-4 w-4 shrink-0 rounded border-[#bdc7d1] accent-[#3029e7]" />
              Enabled
            </label>
          </div>

          {disabled ? <input type="hidden" name={`${edition}Host`} value={endpoint?.host ?? ""} /> : null}
          {disabled ? <input type="hidden" name={`${edition}Port`} value={endpoint?.port ?? defaultPort} /> : null}
          <div className="mt-4 grid gap-4 border-t border-[#e6eaf1] pt-4 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className={labelClassName}>
              Host
              <input name={`${edition}Host`} defaultValue={endpoint?.host ?? ""} placeholder="play.example.com" disabled={disabled} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              Port
              <input name={`${edition}Port`} type="number" min={1} max={65535} defaultValue={endpoint?.port ?? defaultPort} disabled={disabled} className={inputClassName} />
            </label>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

function ErrorText({ children }: { children: string }) {
  return <p role="alert" className="mt-2 rounded-lg border border-[#f2cfd2] bg-[#fff3f3] px-3 py-2 text-[11px] leading-4 text-[#c43b45]">{children}</p>;
}
