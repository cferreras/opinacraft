import Link from "next/link";
import {
  IconBrandMinecraft,
  IconChartBar,
  IconCircleXFilled,
  IconCode,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconExternalLink,
  IconUsers,
} from "@tabler/icons-react";

import { CopyAddressButton } from "@/components/copy-address-button";
import { ServerLogo } from "@/components/server-logo";
import type { ManagedServer } from "@/lib/servers/queries";
import { formatEndpoint, latencyClass } from "@/lib/servers/format";

type ServerStatus = ManagedServer["aggregateStatus"];

function statusLabel(status: ServerStatus) {
  if (status === "online") return "En línea";
  if (status === "offline") return "Fuera de línea";
  return "Sin comprobar";
}

function statusTone(status: ServerStatus) {
  if (status === "online") return "text-[#0e9a55]";
  if (status === "offline") return "text-[#d83a42]";
  return "text-[#7c8799]";
}

function statusMark(status: ServerStatus) {
  if (status === "offline") {
    return <IconCircleXFilled aria-hidden="true" className="text-[#d83a42]" size={10} />;
  }

  return <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${status === "online" ? "bg-[#0e9a55]" : "bg-[#adb6c2]"}`} />;
}

function roleLabel(role: ManagedServer["role"]) {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Administrador";
  return "Editor";
}

function publicationLabel(status: ManagedServer["publicationStatus"]) {
  if (status === "published") return "Publicado";
  if (status === "hidden") return "Oculto";
  return "Borrador";
}

function publicationTone(status: ManagedServer["publicationStatus"]) {
  if (status === "published") return "bg-[#e6f8ef] text-[#0c8950]";
  if (status === "hidden") return "bg-[#fff0f0] text-[#bd3038]";
  return "bg-[#fff7e8] text-[#a66a08]";
}

function verificationLabel(status: ManagedServer["verificationStatus"]) {
  return status === "verified" ? "Verificado" : "Pendiente de verificación";
}

function playersLabel(endpoint: ManagedServer["endpoints"][number] | undefined) {
  if (!endpoint || (endpoint.playersCurrent === null && endpoint.playersMax === null)) return "— / —";
  return `${endpoint.playersCurrent ?? "—"} / ${endpoint.playersMax ?? "—"}`;
}

function Metric({ icon, label, value, tone = "text-[#162033]" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-1.5 first:pl-0 sm:border-l sm:border-[#e6eaf0] sm:first:border-l-0 sm:first:pl-0">
      <span className="shrink-0 text-[#65718c]">{icon}</span>
      <span className="min-w-0">
        <strong className={`block truncate text-[13px] font-semibold leading-4 ${tone}`}>{value}</strong>
        <span className="block text-[10px] leading-4 text-[#7c8799]">{label}</span>
      </span>
    </div>
  );
}

function EndpointChip({ endpoint }: { endpoint: ManagedServer["endpoints"][number] }) {
  const isJava = endpoint.edition === "java";
  const address = formatEndpoint(endpoint);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[#e0e5ea] bg-white px-2.5 py-2">
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isJava ? "bg-[#eef0ff] text-[#2c3be2]" : "bg-[#e9f8ff] text-[#16a0df]"}`}>
        {isJava ? <IconDeviceDesktop aria-hidden="true" size={15} stroke={1.7} /> : <IconDeviceMobile aria-hidden="true" size={15} stroke={1.7} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[9px] font-semibold uppercase tracking-[0.08em] ${isJava ? "text-[#3537bf]" : "text-[#178cbf]"}`}>{isJava ? "Java" : "Bedrock"}</span>
        <code className="mt-0.5 block truncate text-[11px] text-[#202a42]">{address}</code>
      </span>
      <CopyAddressButton value={address} iconOnly className="shrink-0 text-[#64708a] hover:bg-[#f1f3ff] hover:text-[#2d2de4]" />
    </div>
  );
}

export function ServerCard({ server }: { server: ManagedServer }) {
  const endpoint = server.endpoints.find((item) => item.edition === "java") ?? server.endpoints[0];

  return (
    <article className="ui-signal ui-card overflow-hidden transition-shadow hover:shadow-[0_8px_24px_rgba(24,24,27,0.08)]">
      <div className="grid gap-5 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-5 sm:py-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <ServerLogo name={server.name} media={server.media} className="h-14 w-14 rounded-xl sm:h-16 sm:w-16" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="min-w-0 truncate text-[17px] font-semibold leading-6 tracking-[-0.035em] text-[#101722]">{server.name}</h3>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${publicationTone(server.publicationStatus)}`}>
                <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${server.publicationStatus === "published" ? "bg-[#0e9a55]" : server.publicationStatus === "hidden" ? "bg-[#d83a42]" : "bg-[#d99420]"}`} />
                {publicationLabel(server.publicationStatus)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-[#7b8797]">/{server.slug}</p>
            <p className="mt-3 line-clamp-2 max-w-[680px] text-[12px] leading-5 text-[#55627b]">
              {server.description ?? "Una comunidad de Minecraft lista para recibirte."}
            </p>
            {server.tags.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {server.tags.slice(0, 5).map((tag) => (
                  <span key={tag.slug} className="rounded-md border border-[#e0e5ea] bg-[#fafbfc] px-1.5 py-0.5 text-[9px] leading-3 text-[#35415b]">{tag.label}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Link href={`/servers/${server.slug}/manage`} className="ui-button-primary h-9 px-3.5 text-[11px]">
            Gestionar servidor
          </Link>
          {server.publicationStatus === "published" ? (
            <Link href={`/servers/${server.slug}`} className="ui-button-secondary h-9 px-3 text-[11px]">
              Ver ficha
              <IconExternalLink aria-hidden="true" size={13} stroke={1.8} />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-y-1 border-y border-[#e6eaf0] bg-[#fbfcff] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 lg:px-5">
        <Metric icon={<span className="inline-flex items-center justify-center">{statusMark(server.aggregateStatus)}</span>} label="Estado" value={statusLabel(server.aggregateStatus)} tone={statusTone(server.aggregateStatus)} />
        <Metric icon={<IconUsers aria-hidden="true" size={18} stroke={1.7} />} label="Jugadores" value={playersLabel(endpoint)} />
        <Metric icon={<IconCode aria-hidden="true" size={18} stroke={1.7} />} label="Versión" value={endpoint?.version ?? "—"} />
        <Metric icon={<IconChartBar aria-hidden="true" size={18} stroke={1.7} />} label="Ping" value={endpoint?.latencyMs !== null && endpoint?.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "—"} tone={latencyClass(endpoint?.latencyMs ?? null)} />
      </div>

      <div className="grid gap-5 px-4 py-4 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7c8799]">Conexiones del servidor</p>
              <p className="mt-1 text-[11px] text-[#8993a1]">Direcciones disponibles para tu comunidad.</p>
            </div>
            <IconBrandMinecraft aria-hidden="true" className="shrink-0 text-[#aab3c0]" size={18} stroke={1.7} />
          </div>
          {server.endpoints.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {server.endpoints.map((item) => <EndpointChip key={item.edition} endpoint={item} />)}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-[#dce2e7] px-3 py-2.5 text-[11px] text-[#7c8799]">Añade un endpoint para empezar la verificación.</p>
          )}
        </div>

        <div className="border-t border-[#edf0f2] pt-3 text-[10px] leading-5 text-[#7c8799] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p><span className="text-[#4b5870]">Rol:</span> {roleLabel(server.role)}</p>
          <p><span className="text-[#4b5870]">Estado público:</span> {publicationLabel(server.publicationStatus)}</p>
          <p><span className="text-[#4b5870]">Propiedad:</span> {verificationLabel(server.verificationStatus)}</p>
          <Link href={`/servers/${server.slug}/manage`} className="mt-2 inline-flex items-center gap-1 font-semibold text-[#2d34cf] hover:underline">
            Editar información
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
