"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in");
    }
  }, [isPending, router, session]);

  async function handleLogout() {
    setError(null);
    setIsLoggingOut(true);

    try {
      const { error: logoutError } = await authClient.signOut();

      if (logoutError) {
        setError(logoutError.message ?? "Unable to log out.");
        return;
      }

      router.replace("/sign-in");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to log out.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function exportAccount() {
    const response = await fetch("/api/account/export");
    if (!response.ok) { setAccountMessage("No se pudo exportar la cuenta."); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "opinacraft-cuenta.json"; link.click(); URL.revokeObjectURL(url);
    setAccountMessage("Exportación descargada.");
  }

  async function deleteAccount() {
    if (window.prompt("Escribe DELETE ACCOUNT para confirmar") !== "DELETE ACCOUNT") return;
    const response = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE ACCOUNT" }) });
    if (!response.ok) { setAccountMessage("No se pudo borrar la cuenta."); return; }
    await authClient.signOut(); router.replace("/");
  }

  async function handleSendVerification() {
    if (!session) return;
    setVerificationMessage(null);
    setIsSendingVerification(true);

    try {
      const { error: requestError } = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: "/profile",
      });
      setVerificationMessage(
        requestError
          ? requestError.message ?? "No se pudo enviar el email."
          : "Te hemos enviado un nuevo enlace de verificación.",
      );
    } catch (caughtError) {
      setVerificationMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo enviar el email.",
      );
    } finally {
      setIsSendingVerification(false);
    }
  }

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading profile...</p>
      </main>
    );
  }

  const userName = session.user.name || "User";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-12 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-zinc-200/60 dark:bg-zinc-900 dark:shadow-black/20">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          OpinaCraft
        </Link>

        <div className="mt-8 flex justify-center">
          {session.user.image ? (
            <div
              role="img"
              aria-label={`${userName}'s avatar`}
              className="h-24 w-24 rounded-full bg-cover bg-center bg-no-repeat ring-4 ring-zinc-100 dark:ring-zinc-800"
              style={{ backgroundImage: `url("${session.user.image}")` }}
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-950 text-2xl font-semibold text-white ring-4 ring-zinc-100 dark:bg-white dark:text-zinc-950 dark:ring-zinc-800">
              {getInitials(userName)}
            </div>
          )}
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          {userName}
        </h1>

        {!session.user.emailVerified ? (
          <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-left text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">Verifica tu email para publicar servidores.</p>
            <p className="mt-1">Necesitamos confirmar que la cuenta te pertenece.</p>
            <button
              type="button"
              onClick={handleSendVerification}
              disabled={isSendingVerification}
              className="mt-3 font-medium underline disabled:opacity-60"
            >
              {isSendingVerification ? "Enviando..." : "Reenviar enlace"}
            </button>
            {verificationMessage ? <p className="mt-2 text-xs">{verificationMessage}</p> : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {accountMessage ? <p className="mt-4 text-sm text-zinc-600">{accountMessage}</p> : null}

        <div className="mt-8 space-y-3">
          <Link
            href="/change-password"
            className="flex h-11 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Change password
          </Link>
          <button type="button" onClick={() => void exportAccount()} className="h-11 w-full rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700">Exportar mis datos</button>
          <button type="button" onClick={() => void deleteAccount()} className="h-11 w-full rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300">Borrar cuenta</button>
          <Link
            href="/dashboard/servers"
            className="flex h-11 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Managed servers
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="h-11 w-full rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </section>
    </main>
  );
}
