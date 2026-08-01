"use client";

import { useActionState } from "react";

import {
  updateServerAction,
  type ManageState,
} from "@/app/servers/[slug]/manage/actions";
import { TagCombobox } from "@/components/tag-combobox";

type Endpoint = { edition: "java" | "bedrock"; host: string; port: number };

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
    <form action={action} className="space-y-6">
      <input type="hidden" name="serverId" value={server.id} />
      <input type="hidden" name="slug" value={server.slug} />
      <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Name
        {!canEditName ? <input type="hidden" name="name" value={server.name} /> : null}
        <input name="name" defaultValue={server.name} required minLength={3} maxLength={80} disabled={!canEditName} className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950" />
        {state?.fieldErrors?.name ? <ErrorText>{state.fieldErrors.name}</ErrorText> : null}
      </label>
      <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Description
        <textarea name="description" defaultValue={server.description ?? ""} maxLength={2000} rows={5} className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        {state?.fieldErrors?.description ? <ErrorText>{state.fieldErrors.description}</ErrorText> : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Website URL
          <input name="websiteUrl" type="url" defaultValue={server.websiteUrl ?? ""} className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          {state?.fieldErrors?.websiteUrl ? <ErrorText>{state.fieldErrors.websiteUrl}</ErrorText> : null}
        </label>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Tienda del servidor
          <input name="storeUrl" type="url" defaultValue={server.storeUrl ?? ""} placeholder="https://shop.example.com" className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          {state?.fieldErrors?.storeUrl ? <ErrorText>{state.fieldErrors.storeUrl}</ErrorText> : null}
        </label>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Discord invite URL
          <input name="discordUrl" type="url" defaultValue={server.discordUrl ?? ""} className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          {state?.fieldErrors?.discordUrl ? <ErrorText>{state.fieldErrors.discordUrl}</ErrorText> : null}
        </label>
      </div>
      <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Tags
        <TagCombobox name="tags" initialTags={server.tags.map((tag) => tag.label)} allowCreate={server.role === "owner"} />
        {state?.fieldErrors?.tags ? <ErrorText>{state.fieldErrors.tags}</ErrorText> : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <EndpointFields edition="java" endpoint={java} disabled={!canEditEndpoints} />
        <EndpointFields edition="bedrock" endpoint={bedrock} disabled={!canEditEndpoints} />
      </div>
      {state?.fieldErrors?.endpoints ? <ErrorText>{state.fieldErrors.endpoints}</ErrorText> : null}
      <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Publication
        <select name="publicationStatus" defaultValue={server.publicationStatus} disabled={!canPublish} className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
        </select>
        {state?.fieldErrors?.publicationStatus ? <ErrorText>{state.fieldErrors.publicationStatus}</ErrorText> : null}
      </label>
      {state?.formError ? <ErrorText>{state.formError}</ErrorText> : null}
      <button type="submit" className="h-11 rounded-lg bg-zinc-950 px-5 text-sm font-medium text-white dark:bg-white dark:text-zinc-950">Save changes</button>
    </form>
  );
}

function EndpointFields({ edition, endpoint, disabled }: { edition: "java" | "bedrock"; endpoint?: Endpoint; disabled: boolean }) {
  const defaultPort = edition === "java" ? 25565 : 19132;
  return (
    <fieldset className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-2 text-sm font-medium capitalize">{edition}</legend>
      <label className="flex items-center gap-2 text-sm">
        {disabled ? <input type="hidden" name={`${edition}Enabled`} value={endpoint ? "on" : ""} /> : null}
        <input type="checkbox" name={`${edition}Enabled`} defaultChecked={Boolean(endpoint)} disabled={disabled} />
        Enabled
      </label>
      {disabled ? <input type="hidden" name={`${edition}Host`} value={endpoint?.host ?? ""} /> : null}
      {disabled ? <input type="hidden" name={`${edition}Port`} value={endpoint?.port ?? defaultPort} /> : null}
      <input name={`${edition}Host`} defaultValue={endpoint?.host ?? ""} placeholder="play.example.com" disabled={disabled} className="mt-3 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950" />
      <input name={`${edition}Port`} type="number" min={1} max={65535} defaultValue={endpoint?.port ?? defaultPort} disabled={disabled} className="mt-3 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950" />
    </fieldset>
  );
}

function ErrorText({ children }: { children: string }) {
  return <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{children}</p>;
}
