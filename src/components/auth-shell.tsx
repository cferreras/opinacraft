import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-zinc-200/60 dark:bg-zinc-900 dark:shadow-black/20">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Opinacraft
        </Link>
        <div className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <div className="mt-8">{children}</div>
        <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          {footer}
        </div>
      </section>
    </main>
  );
}
