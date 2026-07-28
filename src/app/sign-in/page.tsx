"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { clientEnv } from "@/env/client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const discordEnabled = clientEnv.NEXT_PUBLIC_DISCORD_ENABLED === "true";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/profile",
      });

      if (signInError) {
        setError(signInError.message ?? "Unable to sign in.");
        return;
      }

      router.push("/profile");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDiscordSignIn() {
    setError(null);
    await authClient.signIn.social({
      provider: "discord",
      callbackURL: "/profile",
    });
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue to your Opinacraft account."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-zinc-950 hover:underline dark:text-white"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
          />
        </label>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-zinc-600 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-white"
          >
            Forgot password?
          </Link>
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="h-11 w-full rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {isPending ? "Signing in..." : "Sign in"}
        </button>
        {discordEnabled ? (
          <>
            <div className="relative py-1 text-center text-xs text-zinc-500">
              <span className="relative z-10 bg-white px-3 dark:bg-zinc-900">or</span>
              <div className="absolute inset-x-0 top-1/2 border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <button
              type="button"
              onClick={handleDiscordSignIn}
              className="h-11 w-full rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Continue with Discord
            </button>
          </>
        ) : null}
      </form>
    </AuthShell>
  );
}
