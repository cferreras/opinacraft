import Link from "next/link";

import { ServerCard } from "@/components/server-card";
import { requireServerSession } from "@/lib/session";
import { listManagedServers } from "@/lib/servers/queries";

export default async function ManagedServersPage() {
  const session = await requireServerSession("/dashboard/servers");
  const servers = await listManagedServers(session.user.id);

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Opinacraft
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              Managed servers
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Create and review the Minecraft communities connected to your account.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/servers"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Browse public servers
            </Link>
            <Link
              href="/servers/new"
              className="inline-flex h-11 items-center rounded-lg bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Add server
            </Link>
          </div>
        </div>

        {servers.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              No servers yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Add your first Minecraft community to create its public Opinacraft page.
            </p>
            <Link
              href="/servers/new"
              className="mt-6 inline-flex h-10 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Create a server
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-4">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
