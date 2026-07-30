"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { clientEnv } from "@/env/client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
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
      const { error: signUpError } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/profile",
      });

      if (signUpError) {
        setError(signUpError.message ?? "Unable to create your account.");
        return;
      }

      router.push("/profile");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create your account.",
      );
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
      title="Create your account"
      description="Start building your OpinaCraft workspace today."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-zinc-950 hover:underline dark:text-white"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
            className="mt-2 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-300"
          />
          <span className="mt-2 block text-xs font-normal text-zinc-500">
            Use at least 8 characters.
          </span>
        </label>
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
          {isPending ? "Creating account..." : "Create account"}
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
