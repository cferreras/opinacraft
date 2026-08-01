import Link from "next/link";
import {
  IconBrandMinecraft,
  IconCircleXFilled,
  IconCode,
  IconStarFilled,
  IconUsers,
} from "@tabler/icons-react";

import type { CatalogServer, PublicServer } from "@/lib/servers/queries";
import { formatEndpoint, latencyClass } from "@/lib/servers/format";
import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerLogo } from "@/components/server-logo";

function statusLabel(status: PublicServer["aggregateStatus"]) {
  if (status === "online") return "En línea";
  if (status === "offline") return "Fuera de línea";
  return "Desconocido";
}

function StatusMark({ status }: { status: PublicServer["aggregateStatus"] }) {
  if (status === "online") {
    return <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#0e9a55]" />;
  }
  if (status === "offline") {
    return <IconCircleXFilled aria-hidden="true" className="text-[#d83a42]" size={9} />;
  }
  return <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#adb6c2]" />;
}

function playersLabel(endpoint: CatalogServer["endpoints"][number] | undefined) {
  if (!endpoint) return "— / —";
  if (endpoint.playersCurrent !== null || endpoint.playersMax !== null) {
    return `${endpoint.playersCurrent ?? "—"} / ${endpoint.playersMax ?? "—"}`;
  }
  return "— / —";
}

function ratingLabel(server: CatalogServer) {
  return server.reviewAverage === null
    ? "Sin valoraciones"
    : server.reviewAverage.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function ratingCount(server: CatalogServer) {
  return server.reviewCount > 0 ? `(${server.reviewCount})` : "";
}

function Rating({ server, className }: { server: CatalogServer; className: string }) {
  const count = ratingCount(server);

  return (
    <div className={className}>
      {server.reviewAverage !== null ? <IconStarFilled aria-hidden="true" className="text-[#f4a51c]" size={13} /> : null}
      <span className={server.reviewAverage !== null ? "text-[#3e4853]" : "text-[#89929b]"}>{ratingLabel(server)}</span>
      {count ? <span className="text-[#89929b]">{count}</span> : null}
    </div>
  );
}

export function PublicServerRow({ server }: { server: CatalogServer }) {
  const endpoint = server.endpoints.find((item) => item.edition === "java") ?? server.endpoints[0];
  const endpointAddress = endpoint ? formatEndpoint(endpoint) : server.slug;
  const isUnknown = server.aggregateStatus === "unknown";

  return (
    <article className="grid gap-3 border-t border-[#e7ebef] px-3 py-3.5 transition-colors first:border-t-0 hover:bg-[#fbfcff] sm:px-4 lg:grid-cols-[minmax(330px,1.65fr)_96px_118px_108px_82px_112px_30px] lg:items-center lg:gap-3 lg:px-4 lg:py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <ServerLogo name={server.name} media={server.media} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold leading-5 text-[#101722]">
            <Link href={`/servers/${server.slug}`} className="rounded-sm outline-none hover:text-[#2d34cf] focus-visible:ring-2 focus-visible:ring-[#4655e8]/30">
              {server.name}
            </Link>
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-[#55627b]">
            {server.description ?? "Una comunidad de Minecraft lista para recibirte."}
          </p>
          {server.tags.length > 0 ? (
            <div className="mt-1.5 flex max-w-full flex-wrap gap-1.5 overflow-hidden">
              {server.tags.slice(0, 4).map((tag) => (
                <span key={tag.slug} className="rounded-md border border-[#e0e5ea] bg-[#fafbfc] px-1.5 py-0.5 text-[9px] leading-3 text-[#35415b]">
                  {tag.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden items-center gap-2 text-[11px] text-[#52606d] lg:flex">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef0ff] text-[#2c3be2]">
          <IconBrandMinecraft aria-hidden="true" size={14} stroke={1.7} />
        </span>
        <span>{endpoint?.edition === "bedrock" ? "Bedrock" : "Java"}</span>
      </div>

      <div className="hidden min-w-0 flex-col gap-1 text-[11px] lg:flex">
        <span className={`flex items-center gap-1.5 ${server.aggregateStatus === "online" ? "text-[#0e9a55]" : isUnknown ? "text-[#7c8799]" : "text-[#d83a42]"}`}>
          <StatusMark status={server.aggregateStatus} />
          <span>{statusLabel(server.aggregateStatus)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[#67738b]">
          <IconUsers aria-hidden="true" size={13} stroke={1.7} />
          <span className="tabular-nums">{playersLabel(endpoint)}</span>
        </span>
      </div>

      <div className="hidden items-center gap-1.5 text-[11px] text-[#58636f] lg:flex">
        <IconCode aria-hidden="true" size={14} stroke={1.7} />
        <span className="truncate">{endpoint?.version ?? "—"}</span>
      </div>

      <div className={`hidden text-[11px] tabular-nums lg:block ${latencyClass(endpoint?.latencyMs ?? null)}`}>
        {endpoint?.latencyMs !== null && endpoint?.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "—"}
      </div>

      <Rating server={server} className="hidden items-center gap-1 text-[11px] text-[#67738b] lg:flex" />

      <div className="hidden justify-end lg:flex">
        <CopyAddressButton value={endpointAddress} iconOnly className="text-[#68737e] hover:bg-[#f0f1ff] hover:text-[#2d34cf]" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#eef1f2] pt-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#5e6873]">
          <StatusMark status={server.aggregateStatus} />
          <span className={server.aggregateStatus === "online" ? "text-[#19845c]" : isUnknown ? "text-[#77818c]" : "text-[#d22b30]"}>{statusLabel(server.aggregateStatus)}</span>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5 text-[10px] text-[#5e6873]">
          <IconUsers aria-hidden="true" size={13} stroke={1.7} />
          <span className="tabular-nums">{playersLabel(endpoint)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#5e6873]">
          <IconBrandMinecraft aria-hidden="true" size={13} stroke={1.7} />
          <span>{endpoint?.edition === "bedrock" ? "Bedrock" : "Java"}</span>
          <span className="text-[#b2bac1]">·</span>
          <span className="truncate">{endpoint?.version ?? "—"}</span>
        </div>
        <div className={`flex min-w-0 items-center justify-end gap-1.5 text-[10px] ${latencyClass(endpoint?.latencyMs ?? null)}`}>
          <span>{endpoint?.latencyMs !== null && endpoint?.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "Sin latencia"}</span>
        </div>
        <Rating server={server} className="col-span-2 flex items-center gap-1 text-[10px] text-[#58636f]" />
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <span className="max-w-[65%] truncate text-[10px] text-[#89929b]">{endpointAddress}</span>
        <div className="flex items-center gap-2">
          <CopyAddressButton value={endpointAddress} iconOnly className="text-[#68737e] hover:bg-[#f0f1ff] hover:text-[#2d34cf]" />
          <Link href={`/servers/${server.slug}`} className="inline-flex h-8 items-center rounded-md border border-[#cbd2ff] px-3 text-[10px] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff]">
            Ver servidor
          </Link>
        </div>
      </div>
    </article>
  );
}
