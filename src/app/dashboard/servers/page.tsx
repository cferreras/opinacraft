import Link from "next/link";
import { IconExternalLink, IconPlus } from "@tabler/icons-react";

import { ServerCard } from "@/components/server-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireServerSession } from "@/lib/session";
import { listManagedServers } from "@/lib/servers/queries";

type Props = {
  searchParams?: Promise<{ deleted?: string }>;
};

function countLabel(count: number) {
  return `${count} ${count === 1 ? "servidor" : "servidores"}`;
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="px-4 py-3.5 first:pl-0 last:pr-0 sm:px-5 sm:first:pl-5 sm:last:pr-5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#7c8799]">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold leading-6 tracking-[-0.04em] text-[#162033] tabular-nums">{value}</span>
        <span className="text-[10px] text-[#7c8799]">{detail}</span>
      </dd>
    </div>
  );
}

export default async function ManagedServersPage({ searchParams }: Props) {
  const session = await requireServerSession("/dashboard/servers");
  const [servers, query] = await Promise.all([
    listManagedServers(session.user.id),
    searchParams ?? Promise.resolve<{ deleted?: string }>({}),
  ]);
  const onlineCount = servers.filter((server) => server.aggregateStatus === "online").length;
  const attentionCount = servers.filter(
    (server) => server.publicationStatus !== "published" || server.verificationStatus !== "verified",
  ).length;

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="app-main page-shell px-4 pb-14 sm:px-6 sm:pt-1 lg:px-7 2xl:px-8">
        <section className="pt-7 sm:pt-8" aria-labelledby="managed-servers-heading">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2d34cf]">Espacio de gestión</p>
              <h1 id="managed-servers-heading" className="ui-page-title mt-2.5 max-w-[680px]">
                Tus servidores
              </h1>
              <p className="mt-2 max-w-[620px] text-[13px] leading-[1.55] text-[#55627b]">
                Revisa la salud, la publicación y la información pública de tus comunidades.
              </p>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Link
                href="/servers"
                className="ui-button-secondary h-10 text-[11px]"
              >
                Explorar directorio
                <IconExternalLink aria-hidden="true" size={14} stroke={1.8} />
              </Link>
              <Link
                href="/servers/new"
                className="ui-button-primary h-10 text-[11px]"
              >
                <IconPlus aria-hidden="true" size={15} stroke={2} />
                Añadir servidor
              </Link>
            </div>
          </div>

          {query?.deleted ? (
            <p className="mt-5 rounded-lg border border-[#bde8d1] bg-[#f1fcf5] px-3.5 py-2.5 text-[11px] text-[#147548]" role="status">
              El servidor se ha eliminado correctamente.
            </p>
          ) : null}

          <dl className="mt-7 grid border-y border-[#e0e6eb] bg-[#fbfcff] sm:grid-cols-3 sm:divide-x sm:divide-[#e0e6eb]">
            <SummaryMetric label="Total" value={String(servers.length)} detail={countLabel(servers.length)} />
            <SummaryMetric label="Salud" value={String(onlineCount)} detail="en línea ahora" />
            <SummaryMetric label="Revisión" value={String(attentionCount)} detail="requieren atención" />
          </dl>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#162033]">Comunidades gestionadas</h2>
              <p className="mt-1 text-[11px] text-[#77839a]">Cada ficha reúne lo necesario para mantener tu servidor listo para recibir jugadores.</p>
            </div>
            <span className="text-[11px] text-[#8993a1]">{countLabel(servers.length)}</span>
          </div>

          {servers.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-[#e0e6eb] bg-[#fbfcff] px-6 py-14 text-center">
              <h2 className="text-lg font-semibold text-[#17202a]">Todavía no tienes servidores</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#687580]">
                Añade tu primera comunidad Minecraft para crear su ficha pública en OpinaCraft.
              </p>
              <Link
                href="/servers/new"
                className="ui-button-primary mt-6 h-10 px-4 text-sm"
              >
                <IconPlus aria-hidden="true" size={16} stroke={2} />
                Crear servidor
              </Link>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {servers.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
