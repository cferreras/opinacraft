import Image from "next/image";
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
    <main className="app-auth-page">
      <section className="app-auth-frame">
        <aside className="app-auth-aside hidden md:flex">
          <Link href="/" className="relative z-10 inline-flex items-center gap-2.5 text-sm font-bold tracking-[-0.04em]">
            <Image
              src="/brand/opinacraft-mark-v2-faceted.svg"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              priority
              className="rounded-md bg-white/10 p-1"
            />
            OpinaCraft
          </Link>

          <div className="relative z-10 max-w-[18rem]">
            <span className="inline-flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-indigo-300">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
              Community signal
            </span>
            <h2 className="mt-5 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.065em]">
              Find the place you&apos;ll want to return to.
            </h2>
            <p className="mt-5 text-sm leading-6 text-zinc-400">
              Server health, honest reviews and the details that help you choose your next world.
            </p>
          </div>

          <div className="relative z-10 grid gap-2 text-[0.6875rem] text-zinc-400">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Live server signals
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-300" />
              Java and Bedrock communities
            </span>
          </div>
        </aside>

        <div className="app-auth-form">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold tracking-[-0.03em] text-zinc-950 md:hidden"
          >
            <Image
              src="/brand/opinacraft-mark-v2-faceted.svg"
              alt=""
              aria-hidden="true"
              width={22}
              height={22}
              className="rounded bg-zinc-100 p-0.5"
            />
            OpinaCraft
          </Link>

          <div className="mt-8 md:mt-0">
            <p className="ui-eyebrow">Account access</p>
            <h1 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.06em] text-zinc-950">
              {title}
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
              {description}
            </p>
          </div>

          <div className="mt-8">{children}</div>

          <div className="mt-7 border-t border-zinc-200 pt-5 text-center text-xs text-zinc-500">
            {footer}
          </div>
        </div>
      </section>
    </main>
  );
}
