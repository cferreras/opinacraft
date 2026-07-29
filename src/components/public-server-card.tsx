import Link from "next/link";

import type { PublicServer } from "@/lib/servers/queries";

function formatEndpoint(endpoint: PublicServer["endpoints"][number]) {
  const host = endpoint.host.includes(":") ? `[${endpoint.host}]` : endpoint.host;
  const defaultPort = endpoint.edition === "java" ? 25_565 : 19_132;
  return endpoint.port === defaultPort ? host : `${host}:${endpoint.port}`;
}

export function PublicServerCard({ server }: { server: PublicServer }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
            {server.name}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">/{server.slug}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${server.verificationStatus === "verified" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {server.verificationStatus === "verified" ? "Verified" : "Not verified"}
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
            {endpoint.edition}: {formatEndpoint(endpoint)}
          </code>
        ))}
      </div>
      <Link
        href={`/servers/${server.slug}`}
        className="mt-5 inline-flex text-sm font-medium text-zinc-950 hover:underline dark:text-white"
      >
        View server
      </Link>
    </article>
  );
}
