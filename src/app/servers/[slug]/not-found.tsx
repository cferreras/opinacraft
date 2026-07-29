import Link from "next/link";

export default function ServerNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-zinc-900">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
          Opinacraft
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-950 dark:text-white">
          Server not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This page does not exist or is not public yet.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
        >
          Back home
        </Link>
      </section>
    </main>
  );
}
