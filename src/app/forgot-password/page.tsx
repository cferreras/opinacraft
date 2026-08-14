"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [isPending, setIsPending] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setMessage(null); setIsPending(true); try { const { error: requestError } = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` }); if (requestError) setError(requestError.message ?? "No se ha podido solicitar el enlace."); else setMessage("Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña."); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "No se ha podido solicitar el enlace."); } finally { setIsPending(false); } }
  return <AuthShell title="Restablece tu contraseña" description="Introduce tu email y te enviaremos un enlace seguro." footer={<Link href="/sign-in" className="font-medium text-primary hover:underline">Volver a iniciar sesión</Link>}><form onSubmit={handleSubmit} className="grid gap-5"><Field><FieldLabel htmlFor="forgot-email">Email</FieldLabel><Input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="h-10" /></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}<Button type="submit" size="lg" disabled={isPending} className="w-full">{isPending ? "Enviando enlace…" : "Enviar enlace"}</Button></form></AuthShell>;
}
