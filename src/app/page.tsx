import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="w-full max-w-3xl rounded-2xl bg-white p-10 shadow-xl shadow-zinc-200/60 dark:bg-zinc-900 dark:shadow-black/20 sm:p-14">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
          OpinaCraft
        </p>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-5xl">
          Discover Minecraft communities worth joining.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Create a public page for your server and keep the details players need in one place.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/servers/new"
            className="inline-flex h-11 items-center rounded-lg bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Add a server
          </Link>
          <Link
            href="/servers"
            className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Browse servers
          </Link>
          <Link
            href="/dashboard/servers"
            className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Manage servers
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
