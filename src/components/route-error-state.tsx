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
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 h-10 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
