import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublishedServerBySlug } from "@/lib/servers/queries";

type PublicServerPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
};

export async function generateMetadata({ params }: PublicServerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const server = await getPublishedServerBySlug(slug);

  return server
    ? {
        title: `${server.name} | Opinacraft`,
        description: server.description ?? `Discover ${server.name} on Opinacraft.`,
      }
    : { title: "Server not found | Opinacraft" };
}

export default async function PublicServerPage({
  params,
  searchParams,
}: PublicServerPageProps) {
  const [{ slug }, { created }] = await Promise.all([params, searchParams]);
  const server = await getPublishedServerBySlug(slug);

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
          Opinacraft
        </Link>
        {created === "1" ? (
          <p className="mt-8 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Your server page is live.
          </p>
        ) : null}
        <div className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
            Minecraft server
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {server.name}
          </h1>
          {server.description ? (
            <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-zinc-600 dark:text-zinc-400">
              {server.description}
            </p>
          ) : null}
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
                  {endpoint.host}:{endpoint.port}
                </code>
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

        <p className="mt-10 text-xs text-zinc-500">
          Listed on Opinacraft on {server.createdAt.toLocaleDateString("en-US")}.
        </p>
      </article>
    </main>
  );
}
