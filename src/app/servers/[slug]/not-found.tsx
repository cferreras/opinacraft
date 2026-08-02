import Link from "next/link";

export default function ServerNotFound() {
  return (
    <main className="app-auth-page">
      <section className="ui-card w-full max-w-md p-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
          OpinaCraft
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.05em] text-zinc-950">
          Server not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This page does not exist or is not public yet.
        </p>
        <Link
          href="/"
          className="ui-button-primary mt-6"
        >
          Back home
        </Link>
      </section>
    </main>
  );
}
