export default function LoadingServersPage() {
  return (
    <main className="app-auth-page">
      <section className="mx-auto w-full max-w-4xl animate-pulse">
        <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-7 h-9 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-10 grid gap-4">
          <div className="ui-card h-44 animate-pulse" />
          <div className="ui-card h-44 animate-pulse" />
        </div>
      </section>
    </main>
  );
}
