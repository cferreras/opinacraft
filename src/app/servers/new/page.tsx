import Link from "next/link";

import { ServerForm } from "@/components/server-form";
import { requireServerSession } from "@/lib/session";

export default async function NewServerPage() {
  await requireServerSession("/servers/new");

  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-8 shadow-xl shadow-zinc-200/60 dark:bg-zinc-900 dark:shadow-black/20 sm:p-10">
        <Link
          href="/servers"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back to managed servers
        </Link>
        <div className="mt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Add a Minecraft server
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Create a public page for your Minecraft community. Your page will be published immediately.
          </p>
        </div>
        <div className="mt-10">
          <ServerForm />
        </div>
      </section>
    </main>
  );
}
