import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getPublishedServerBySlug } from "@/lib/servers/queries";
import { formatEndpoint } from "@/lib/servers/format";
import { ReportForm } from "@/components/report-form";
import { CopyAddressButton } from "@/components/copy-address-button";

type PublicServerPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

const getPublishedServer = cache(getPublishedServerBySlug);

export async function generateMetadata({ params }: PublicServerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const server = await getPublishedServer(slug);

  return server
    ? {
        title: `${server.name} | OpinaCraft`,
        description: server.description ?? `Discover ${server.name} on OpinaCraft.`,
        alternates: { canonical: `/servers/${server.slug}` },
        openGraph: { title: server.name, description: server.description ?? undefined, type: "website", images: server.media.find((media) => media.kind === "banner" || media.kind === "logo")?.url ? [{ url: server.media.find((media) => media.kind === "banner" || media.kind === "logo")!.url }] : undefined },
      }
    : { title: "Server not found | OpinaCraft" };
}

export default async function PublicServerPage({
  params,
}: PublicServerPageProps) {
  const { slug } = await params;
  const server = await getPublishedServer(slug);

  if (!server) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <article className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-8 shadow-xl shadow-zinc-200/60 dark:bg-zinc-900 dark:shadow-black/20 sm:p-10">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          OpinaCraft
        </Link>
        <Link
          href="/servers"
          className="ml-4 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          All servers
        </Link>
        <div className="mt-8">
          {server.media.find((media) => media.kind === "logo") ? <img src={server.media.find((media) => media.kind === "logo")?.url} alt={`${server.name} logo`} className="mb-6 h-20 w-20 rounded-2xl object-cover" /> : null}
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
            Minecraft server
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {server.name}
          </h1>
          <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-medium ${server.aggregateStatus === "online" ? "bg-emerald-100 text-emerald-800" : server.aggregateStatus === "offline" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
            {server.aggregateStatus === "online" ? "Online" : server.aggregateStatus === "offline" ? "Offline" : "Estado desconocido"}
          </span>
          {server.description ? (
            <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-zinc-600 dark:text-zinc-400">
              {server.description}
            </p>
          ) : null}
          {server.tags.length > 0 ? <div className="mt-5 flex flex-wrap gap-2">{server.tags.map((tag) => <span key={tag.slug} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200">{tag.label}</span>)}</div> : null}
        </div>

        <section className="mt-10">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
            Connect
          </h2>
          <div className="mt-4 grid gap-3">
            {server.endpoints.map((endpoint) => (
              <div
                key={endpoint.edition}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <span className="text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
                  {endpoint.edition}
                </span>
                <code className="text-sm text-zinc-950 dark:text-white">
                  {formatEndpoint(endpoint)}
                </code>
                <CopyAddressButton value={formatEndpoint(endpoint)} />
                <span className="text-xs capitalize text-zinc-500">
                  {endpoint.verificationStatus === "verified" ? "verified" : "not verified"} · {endpoint.healthStatus}
                  {endpoint.playersCurrent !== null && endpoint.playersMax !== null ? ` · ${endpoint.playersCurrent}/${endpoint.playersMax} players` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>

        {server.websiteUrl || server.discordUrl ? (
          <section className="mt-10 flex flex-wrap gap-3">
            {server.websiteUrl ? (
              <a
                href={server.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Website
              </a>
            ) : null}
            {server.discordUrl ? (
              <a
                href={server.discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Discord
              </a>
            ) : null}
          </section>
        ) : null}

        <ReportForm serverId={server.id} />

        <p className="mt-10 text-xs text-zinc-500">
          Listed on OpinaCraft on {server.createdAt.toLocaleDateString("en-US")}.
        </p>
      </article>
    </main>
  );
}
