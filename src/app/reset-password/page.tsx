"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() { return <Suspense fallback={<main className="grid min-h-screen place-items-center"><Skeleton className="h-32 w-full max-w-md" /></main>}><ResetPasswordForm /></Suspense>; }
function ResetPasswordForm() {
  const router = useRouter(); const token = useSearchParams().get("token"); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [error, setError] = useState<string | null>(null); const [isPending, setIsPending] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); if (!token) { setError("Este enlace no es válido o ha caducado."); return; } if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; } setIsPending(true); try { const { error: resetError } = await authClient.resetPassword({ newPassword: password, token }); if (resetError) { setError(resetError.message ?? "No se ha podido restablecer la contraseña."); return; } router.push("/sign-in?reset=success"); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "No se ha podido restablecer la contraseña."); } finally { setIsPending(false); } }
  return <AuthShell title="Elige una contraseña nueva" description="Define una contraseña nueva para tu cuenta de OpinaCraft." footer={<Link href="/sign-in" className="font-medium text-primary hover:underline">Volver a iniciar sesión</Link>}><form onSubmit={handleSubmit} className="grid gap-5"><Field><FieldLabel htmlFor="reset-password">Nueva contraseña</FieldLabel><Input id="reset-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" className="h-10" /></Field><Field><FieldLabel htmlFor="reset-confirmation">Confirmar contraseña</FieldLabel><Input id="reset-confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" className="h-10" /></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="submit" size="lg" disabled={isPending || !token} className="w-full">{isPending ? "Actualizando contraseña…" : "Actualizar contraseña"}</Button></form></AuthShell>;
}
