export default function LoadingServersPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="mx-auto w-full max-w-4xl animate-pulse">
        <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-7 h-9 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-10 grid gap-4">
          <div className="h-44 rounded-xl bg-white dark:bg-zinc-900" />
          <div className="h-44 rounded-xl bg-white dark:bg-zinc-900" />
        </div>
      </section>
    </main>
  );
}
