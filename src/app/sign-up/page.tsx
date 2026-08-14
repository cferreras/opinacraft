"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AuthShell } from "@/components/auth-shell";
import { DiscordSignInButton } from "@/components/discord-sign-in-button";
import { authClient } from "@/lib/auth-client";
import { clientEnv } from "@/env/client";
import { safeCallbackUrl } from "@/lib/callback-url";

export default function SignUpPage() {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [isPending, setIsPending] = useState(false); const discordEnabled = clientEnv.NEXT_PUBLIC_DISCORD_ENABLED === "true";
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setMessage(null); setIsPending(true); const callbackURL = safeCallbackUrl(new URLSearchParams(window.location.search).get("callbackURL"), "/profile"); try { const { error: signUpError } = await authClient.signUp.email({ name, email, password, callbackURL }); if (signUpError) { setError(signUpError.message ?? "No se ha podido crear la cuenta."); return; } setMessage("Cuenta creada. Revisa tu email y confirma el enlace antes de iniciar sesión."); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "No se ha podido crear la cuenta."); } finally { setIsPending(false); } }
  async function handleDiscordSignIn() { setError(null); const callbackURL = safeCallbackUrl(new URLSearchParams(window.location.search).get("callbackURL"), "/profile"); await authClient.signIn.social({ provider: "discord", callbackURL }); }
  return <AuthShell title="Crea tu cuenta" description="Empieza a construir tu espacio de OpinaCraft." footer={<>¿Ya tienes una cuenta? <Link href="/sign-in" className="font-medium text-primary hover:underline">Iniciar sesión</Link></>}>{message ? <Alert><AlertDescription>{message} <Button variant="link" asChild size="sm" className="h-auto p-0"><Link href="/sign-in">Ir a iniciar sesión</Link></Button></AlertDescription></Alert> : <form onSubmit={handleSubmit} className="grid gap-5"><Field><FieldLabel htmlFor="sign-up-name">Nombre</FieldLabel><Input id="sign-up-name" type="text" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" className="h-10" /></Field><Field><FieldLabel htmlFor="sign-up-email">Email</FieldLabel><Input id="sign-up-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="h-10" /></Field><Field><FieldLabel htmlFor="sign-up-password">Contraseña</FieldLabel><Input id="sign-up-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" className="h-10" /><FieldDescription>Usa al menos 8 caracteres.</FieldDescription></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="submit" size="lg" disabled={isPending} className="w-full">{isPending ? "Creando cuenta…" : "Crear cuenta"}</Button>{discordEnabled ? <><div className="relative py-1 text-center text-xs text-muted-foreground"><Separator /><span className="relative -top-3 bg-card px-3">o</span></div><DiscordSignInButton onClick={handleDiscordSignIn} /></> : null}</form>}</AuthShell>;
}
