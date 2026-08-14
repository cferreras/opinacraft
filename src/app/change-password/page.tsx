"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

export default function ChangePasswordPage() {
  const router = useRouter(); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [error, setError] = useState<string | null>(null); const [isPending, setIsPending] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); if (newPassword !== confirmation) { setError("Las contraseñas no coinciden."); return; } setIsPending(true); try { const { error: changeError } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }); if (changeError) { setError(changeError.message ?? "No se ha podido cambiar la contraseña."); return; } router.push("/profile"); router.refresh(); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "No se ha podido cambiar la contraseña."); } finally { setIsPending(false); } }
  return <AuthShell title="Cambia tu contraseña" description="Actualiza la contraseña de tu cuenta autenticada." footer={<Link href="/profile" className="font-medium text-primary hover:underline">Volver al perfil</Link>}><form onSubmit={handleSubmit} className="grid gap-5"><Field><FieldLabel htmlFor="current-password">Contraseña actual</FieldLabel><Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" className="h-10" /></Field><Field><FieldLabel htmlFor="new-password">Nueva contraseña</FieldLabel><Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} autoComplete="new-password" className="h-10" /></Field><Field><FieldLabel htmlFor="confirm-password">Confirmar contraseña</FieldLabel><Input id="confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" className="h-10" /></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="submit" size="lg" disabled={isPending} className="w-full">{isPending ? "Cambiando contraseña…" : "Cambiar contraseña"}</Button></form></AuthShell>;
}
