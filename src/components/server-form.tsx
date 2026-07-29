"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createServerAction,
  type CreateServerState,
} from "@/app/servers/new/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-lg bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
    >
      {pending ? "Creating server..." : "Create server"}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-2 text-sm text-red-700 dark:text-red-300">{message}</p>
  ) : null;
}

function EndpointFields({
  edition,
  enabled,
  onEnabledChange,
  error,
}: {
  edition: "java" | "bedrock";
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  error?: string;
}) {
  const defaults = edition === "java" ? { name: "Java", port: 25565 } : { name: "Bedrock", port: 19132 };

  return (
    <fieldset className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {defaults.name}
      </legend>
      <label className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          name={`${edition}Enabled`}
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 accent-zinc-950 dark:border-zinc-700 dark:accent-white"
        />
        This server has a {defaults.name} endpoint
      </label>
      {enabled ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_150px]">
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Host
            <input
              name={`${edition}Host`}
              type="text"
              required={enabled}
              placeholder="play.example.com"
              autoComplete="url"
              className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Port
            <input
              name={`${edition}Port`}
              type="number"
              min={1}
              max={65535}
              defaultValue={defaults.port}
              required={enabled}
              className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
            />
          </label>
        </div>
      ) : null}
      <FieldError message={error} />
    </fieldset>
  );
}

export function ServerForm() {
  const [state, formAction] = useActionState<CreateServerState | null, FormData>(
    createServerAction,
    null,
  );
  const [javaEnabled, setJavaEnabled] = useState(true);
  const [bedrockEnabled, setBedrockEnabled] = useState(false);

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            Server information
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tell players what makes your community worth discovering.
          </p>
        </div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Name
          <input
            name="name"
            type="text"
            required
            minLength={3}
            maxLength={80}
            autoComplete="organization"
            className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
          />
          <FieldError message={state?.fieldErrors?.name} />
        </label>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Description
          <textarea
            name="description"
            rows={5}
            maxLength={2000}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
          />
          <FieldError message={state?.fieldErrors?.description} />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Website URL
            <input
              name="websiteUrl"
              type="url"
              placeholder="https://example.com"
              className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
            />
            <FieldError message={state?.fieldErrors?.websiteUrl} />
          </label>
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Discord invite URL
            <input
              name="discordUrl"
              type="url"
              placeholder="https://discord.gg/example"
              className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
            />
            <FieldError message={state?.fieldErrors?.discordUrl} />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            Server addresses
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add at least one address. Java defaults to port 25565 and Bedrock to 19132.
          </p>
        </div>
        <EndpointFields
          edition="java"
          enabled={javaEnabled}
          onEnabledChange={setJavaEnabled}
          error={state?.fieldErrors?.endpoints}
        />
        <EndpointFields
          edition="bedrock"
          enabled={bedrockEnabled}
          onEnabledChange={setBedrockEnabled}
          error={state?.fieldErrors?.endpoints}
        />
        {!javaEnabled && !bedrockEnabled ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Select at least one Minecraft edition.
          </p>
        ) : null}
      </section>

      {state?.formError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <SubmitButton />
      </div>
    </form>
  );
}
