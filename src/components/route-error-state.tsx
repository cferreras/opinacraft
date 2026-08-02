"use client";

import { useEffect } from "react";

export function RouteErrorState({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}) {
  useEffect(() => {
    console.error("Route failed", {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="app-auth-page">
      <section className="ui-card w-full max-w-md p-8 text-center">
        <p className="ui-eyebrow">System signal</p>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-zinc-950">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="ui-button-primary mt-6"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
