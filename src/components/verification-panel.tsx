"use client";

import {
  checkVerificationAction,
  startVerificationAction,
} from "@/app/servers/[slug]/manage/actions";

type Display = {
  id: string;
  status: string;
  attemptCount: number;
  lastFailureCode: string | null;
  expiresAt: Date;
  code: string | null;
} | null;

export function VerificationPanel({
  serverId,
  slug,
  verification,
}: {
  serverId: string;
  slug: string;
  verification: Display;
}) {
  const active = verification?.status === "pending" && verification.code;

  return (
    <section className="rounded-2xl bg-white p-6 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ownership verification</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Add the temporary code to the Java server MOTD.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs capitalize dark:bg-zinc-800">
          {verification?.status ?? "unverified"}
        </span>
      </div>

      {active ? (
        <div className="mt-5 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <code className="text-lg font-semibold tracking-widest">
            {verification.code}
          </code>
          <p className="mt-2 text-sm text-zinc-500">
            Expires {verification.expiresAt.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}. Attempts used: {verification.attemptCount}/5.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            After the check succeeds, you can remove this code from the MOTD.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={checkVerificationAction}>
              <input type="hidden" name="serverId" value={serverId} />
              <input type="hidden" name="slug" value={slug} />
              <input
                type="hidden"
                name="verificationId"
                value={verification.id}
              />
              <button className="h-10 rounded-lg bg-zinc-950 px-4 text-sm text-white dark:bg-white dark:text-zinc-950">
                Check MOTD
              </button>
            </form>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(verification.code ?? "")}
              className="h-10 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
            >
              Copy code
            </button>
            <form action={startVerificationAction}>
              <input type="hidden" name="serverId" value={serverId} />
              <input type="hidden" name="slug" value={slug} />
              <button className="h-10 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700">
                Regenerate
              </button>
            </form>
          </div>
        </div>
      ) : (
        <form action={startVerificationAction} className="mt-5">
          <input type="hidden" name="serverId" value={serverId} />
          <input type="hidden" name="slug" value={slug} />
          <button className="h-10 rounded-lg bg-zinc-950 px-4 text-sm text-white dark:bg-zinc-950 dark:text-white">
            Generate verification code
          </button>
        </form>
      )}

      {verification?.lastFailureCode ? (
        <p className="mt-4 text-sm text-amber-700">
          Last result: {verification.lastFailureCode.replaceAll("_", " ")}
        </p>
      ) : null}
    </section>
  );
}
