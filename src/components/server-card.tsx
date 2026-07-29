import Link from "next/link";

import type { ManagedServer } from "@/lib/servers/queries";

function endpointLabel(endpoint: ManagedServer["endpoints"][number]) {
  const host = endpoint.host.includes(":") ? `[${endpoint.host}]` : endpoint.host;
  return `${host}:${endpoint.port}`;
}

export function ServerCard({ server }: { server: ManagedServer }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
            {server.name}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">/{server.slug}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {server.role}
        </span>
      </div>
      {server.description ? (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {server.description}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {server.endpoints.map((endpoint) => (
          <code
            key={endpoint.edition}
            className="rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {endpoint.edition}: {endpointLabel(endpoint)}
          </code>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs capitalize text-zinc-500">{server.publicationStatus} &middot; {server.verificationStatus}</span>
        <div className="flex gap-3"><Link href={`/servers/${server.slug}/manage`} className="text-sm font-medium text-zinc-950 hover:underline dark:text-white">Manage</Link>{server.publicationStatus === "published" ? <Link href={`/servers/${server.slug}`} className="text-sm font-medium text-zinc-950 hover:underline dark:text-white">View public page</Link> : null}</div>
      </div>
    </article>
  );
}
