"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AuthShell } from "@/components/auth-shell";
import { DiscordSignInButton } from "@/components/discord-sign-in-button";
import { authClient } from "@/lib/auth-client";
import { clientEnv } from "@/env/client";
import { safeCallbackUrl } from "@/lib/callback-url";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [isPending, setIsPending] = useState(false); const discordEnabled = clientEnv.NEXT_PUBLIC_DISCORD_ENABLED === "true";
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setIsPending(true); const callbackURL = safeCallbackUrl(new URLSearchParams(window.location.search).get("callbackURL"), "/profile"); try { const { error: signInError } = await authClient.signIn.email({ email, password, callbackURL }); if (signInError) { setError(signInError.message ?? "No se ha podido iniciar sesión."); return; } router.push(callbackURL); router.refresh(); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "No se ha podido iniciar sesión."); } finally { setIsPending(false); } }
  async function handleDiscordSignIn() { setError(null); const callbackURL = safeCallbackUrl(new URLSearchParams(window.location.search).get("callbackURL"), "/profile"); await authClient.signIn.social({ provider: "discord", callbackURL }); }
  return <AuthShell title="Bienvenido de nuevo" description="Inicia sesión para continuar en tu cuenta de OpinaCraft." footer={<>¿No tienes una cuenta? <Link href="/sign-up" className="font-medium text-primary hover:underline">Crear una</Link></>}><form onSubmit={handleSubmit} className="grid gap-5"><Field><FieldLabel htmlFor="sign-in-email">Email</FieldLabel><Input id="sign-in-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="h-10" /></Field><Field><FieldLabel htmlFor="sign-in-password">Contraseña</FieldLabel><Input id="sign-in-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="h-10" /><Button variant="link" asChild size="lg" className="w-fit"><Link href="/forgot-password">¿Has olvidado la contraseña?</Link></Button></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="submit" size="lg" disabled={isPending} className="w-full">{isPending ? "Iniciando sesión…" : "Iniciar sesión"}</Button>{discordEnabled ? <><div className="relative py-1 text-center text-xs text-muted-foreground"><Separator /><span className="relative -top-3 bg-card px-3">o</span></div><DiscordSignInButton onClick={handleDiscordSignIn} /></> : null}</form></AuthShell>;
}
