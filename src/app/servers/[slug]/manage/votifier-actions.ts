"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/session";
import { requireServerRole, ServerPermissionError } from "@/lib/servers/permissions";
import { consumeRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { votesEnabled } from "@/lib/votes/cached";
import { VOTIFIER_SERVICE_NAME } from "@/lib/votes/service";
import { sendVotifierVote, votifierErrorMessages, type VotifierResult } from "@/lib/votes/votifier";
import { decryptVotifierSecret, encryptVotifierSecret, votifierSecretConfigured } from "@/lib/votes/votifier-secret";
import {
  deleteVotifierSettings,
  getStoredVotifierSettings,
  parseVotifierForm,
  recordVotifierTest,
  saveVotifierSettings,
  testsStoredSettings,
  type VotifierFieldErrors,
} from "@/lib/votes/votifier-settings";

type FailureCode = Extract<VotifierResult, { ok: false }>["code"];

export type VotifierTestResult =
  | { ok: true; host: string; port: number; latencyMs: number }
  | { ok: false; code: FailureCode; message: string };

export type VotifierActionState = {
  /** Set when the action did what it was asked; the panel reads it to clear the typed secret. */
  done?: "saved" | "tested" | "removed";
  formError?: string;
  fieldErrors?: VotifierFieldErrors;
  test?: VotifierTestResult;
} | null;

const TEST_TIMEOUT_MS = 5_000;
const TEST_WINDOW_MS = 10 * 60 * 1000;
// A test opens a TCP connection to an address the owner chose: without a ceiling the button would be
// a port scanner run from our network.
const TEST_LIMIT_PER_SERVER = 10;
const TEST_LIMIT_PER_USER = 20;

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/** Only the owner and admins touch where votes go. Editors see the summary but not the settings. */
async function authorize(formData: FormData, { needsEncryption = true } = {}): Promise<
  { ok: true; userId: string; serverId: string; slug: string } | { ok: false; state: VotifierActionState }
> {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  if (!votesEnabled()) return { ok: false, state: { formError: "Los votos todavía no están disponibles." } };
  // Removing settings needs no key, so an owner can still clear them while storage is switched off.
  if (needsEncryption && !votifierSecretConfigured()) return { ok: false, state: { formError: "Votifier todavía no está disponible en OpinaCraft." } };
  try {
    await requireServerRole(serverId, session.user.id, ["owner", "admin"]);
  } catch (error) {
    if (error instanceof ServerPermissionError) return { ok: false, state: { formError: "Solo el propietario y los administradores pueden configurar Votifier." } };
    throw error;
  }
  return { ok: true, userId: session.user.id, serverId, slug };
}

function readForm(formData: FormData) {
  return {
    host: formValue(formData, "host"),
    port: formValue(formData, "port"),
    keyType: formValue(formData, "keyType"),
    secret: formValue(formData, "secret"),
  };
}

function storedSecret(ciphertext: Buffer) {
  try {
    return decryptVotifierSecret(ciphertext);
  } catch (error) {
    // A rotated VOTIFIER_SECRET leaves stored keys unreadable; the owner has to paste theirs again.
    console.error("[votifier] stored secret could not be decrypted", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

export async function saveVotifierAction(_previous: VotifierActionState, formData: FormData): Promise<VotifierActionState> {
  const auth = await authorize(formData);
  if (!auth.ok) return auth.state;

  try {
    const stored = await getStoredVotifierSettings(auth.serverId);
    const parsed = parseVotifierForm(readForm(formData), stored ? { keyType: stored.keyType } : null);
    if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

    const saved = await saveVotifierSettings(auth.serverId, auth.userId, {
      host: parsed.value.host,
      port: parsed.value.port,
      keyType: parsed.value.keyType,
      secretCiphertext: parsed.value.secret ? encryptVotifierSecret(parsed.value.secret) : null,
    });
    if (!saved) return { fieldErrors: { secret: "Pega la clave otra vez: la configuración cambió mientras editabas." } };
  } catch (error) {
    console.error("[votifier] failed to save settings", error instanceof Error ? error.name : "unknown");
    return { formError: "No se ha podido guardar Votifier. Inténtalo de nuevo en unos minutos." };
  }

  revalidatePath(`/servers/${auth.slug}/manage`);
  return { done: "saved" };
}

export async function testVotifierAction(_previous: VotifierActionState, formData: FormData): Promise<VotifierActionState> {
  const auth = await authorize(formData);
  if (!auth.ok) return auth.state;

  let stored: Awaited<ReturnType<typeof getStoredVotifierSettings>>;
  try {
    stored = await getStoredVotifierSettings(auth.serverId);
  } catch (error) {
    console.error("[votifier] failed to load settings", error instanceof Error ? error.name : "unknown");
    return { formError: "No se ha podido probar la conexión. Inténtalo de nuevo en unos minutos." };
  }
  const parsed = parseVotifierForm(readForm(formData), stored ? { keyType: stored.keyType } : null);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const saved = stored ? storedSecret(stored.secretCiphertext) : null;
  const secret = parsed.value.secret ?? saved;
  if (!secret) return { fieldErrors: { secret: "Pega la clave otra vez para probar la conexión." } };

  try {
    await consumeRateLimit(`votifier-test:server:${auth.serverId}`, TEST_LIMIT_PER_SERVER, TEST_WINDOW_MS);
    await consumeRateLimit(`votifier-test:user:${auth.userId}`, TEST_LIMIT_PER_USER, TEST_WINDOW_MS);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return { formError: `Has probado la conexión muchas veces seguidas. Espera ${minutes === 1 ? "un minuto" : `${minutes} minutos`} antes de volver a intentarlo.` };
    }
    console.error("[votifier] rate limit check failed", error instanceof Error ? error.name : "unknown");
    return { formError: "No se ha podido probar la conexión. Inténtalo de nuevo en unos minutos." };
  }

  const now = new Date();
  let result: VotifierResult;
  try {
    result = await sendVotifierVote(
      { host: parsed.value.host, port: parsed.value.port, keyType: parsed.value.keyType, secret },
      { serviceName: VOTIFIER_SERVICE_NAME, username: "OpinaCraft", address: "127.0.0.1", timestamp: now.getTime() },
      { timeoutMs: TEST_TIMEOUT_MS },
    );
  } catch (error) {
    console.error("[votifier] test vote crashed", error instanceof Error ? error.name : "unknown");
    result = { ok: false, code: "protocol", latencyMs: 0 };
  }

  // Only a test of what is saved says anything about the live settings; a test of unsaved values
  // answers in the panel and is forgotten.
  const storedPlain = stored && saved ? { host: stored.host, port: stored.port, keyType: stored.keyType, secret: saved } : null;
  if (testsStoredSettings(parsed.value, storedPlain)) {
    await recordVotifierTest(auth.serverId, { ok: result.ok, code: result.ok ? null : result.code, latencyMs: result.latencyMs, at: now }).catch((error) => {
      console.error("[votifier] failed to record test", error instanceof Error ? error.name : "unknown");
    });
    revalidatePath(`/servers/${auth.slug}/manage`);
  }

  return {
    done: "tested",
    test: result.ok
      ? { ok: true, host: parsed.value.host, port: parsed.value.port, latencyMs: result.latencyMs }
      : { ok: false, code: result.code, message: votifierErrorMessages[result.code] },
  };
}

export async function removeVotifierAction(_previous: VotifierActionState, formData: FormData): Promise<VotifierActionState> {
  const auth = await authorize(formData, { needsEncryption: false });
  if (!auth.ok) return auth.state;
  try {
    await deleteVotifierSettings(auth.serverId);
  } catch (error) {
    console.error("[votifier] failed to remove settings", error instanceof Error ? error.name : "unknown");
    return { formError: "No se ha podido quitar Votifier. Inténtalo de nuevo en unos minutos." };
  }
  revalidatePath(`/servers/${auth.slug}/manage`);
  return { done: "removed" };
}
