import Link from "next/link";

import type { PublicServer } from "@/lib/servers/queries";
import { formatEndpoint } from "@/lib/servers/format";
import { CopyAddressButton } from "@/components/copy-address-button";

export function PublicServerCard({ server }: { server: PublicServer }) {
  const banner = server.media.find((media) => media.kind === "banner");
  return <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
    {banner ? <img src={banner.url} alt="" className="mb-5 h-32 w-full rounded-lg object-cover" /> : null}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950 dark:text-white">{server.name}</h2><p className="mt-1 text-sm text-zinc-500">/{server.slug}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${server.aggregateStatus === "online" ? "bg-emerald-100 text-emerald-800" : server.aggregateStatus === "offline" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{server.aggregateStatus === "online" ? "Online" : server.aggregateStatus === "offline" ? "Offline" : "Estado desconocido"}</span></div>
    {server.description ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{server.description}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">{server.endpoints.map((endpoint) => <div key={endpoint.edition} className="rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"><code>{endpoint.edition}: {formatEndpoint(endpoint)}</code><CopyAddressButton value={formatEndpoint(endpoint)} /><span className="ml-2 capitalize text-zinc-500">{endpoint.verificationStatus === "verified" ? "verificado" : "no verificado"}</span></div>)}</div>
    <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">{server.endpoints.map((endpoint) => <span key={`${endpoint.edition}-health`} className={endpoint.healthStatus === "online" ? "text-emerald-700 dark:text-emerald-300" : endpoint.healthStatus === "offline" ? "text-red-700 dark:text-red-300" : undefined}>{endpoint.edition}: {endpoint.healthStatus}{endpoint.playersCurrent !== null && endpoint.playersMax !== null ? ` · ${endpoint.playersCurrent}/${endpoint.playersMax}` : ""}{endpoint.version ? ` · ${endpoint.version}` : ""}{endpoint.latencyMs !== null ? ` · ${endpoint.latencyMs} ms` : ""}{endpoint.lastCheckedAt ? ` · ${endpoint.lastCheckedAt.toLocaleString("es-ES")}` : ""}</span>)}</div>
    {server.tags.length > 0 ? <div className="mt-4 flex flex-wrap gap-2">{server.tags.map((tag) => <span key={tag.slug} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200">{tag.label}</span>)}</div> : null}
    <Link href={`/servers/${server.slug}`} className="mt-5 inline-flex text-sm font-medium text-zinc-950 hover:underline dark:text-white">Ver servidor</Link>
  </article>;
}
