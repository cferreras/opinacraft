import { and, desc, eq, gte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { serverVotes, serverVotifierSettings } from "@/schema";
import { isPublicHost, normalizeHost, ServerInputError } from "@/lib/servers/validation";
import { isValidVotifierSecret, type VotifierKeyType } from "@/lib/votes/votifier";
import { localVotifierHostsAllowed } from "@/lib/votes/local-votifier";
import { VOTIFIER_DEFAULT_PORT, VOTIFIER_PORT_MIN, VOTIFIER_PORT_MAX, VOTIFIER_HOST_MAX_LENGTH, votifierKeyTypes, deriveVotifierStatus, votifierStatusLabels, votifierRailLabels, type VotifierStatus, type VotifierSettingsView, type VotifierDeliveryHealth } from "./votifier-display";

export { VOTIFIER_DEFAULT_PORT, VOTIFIER_PORT_MIN, VOTIFIER_PORT_MAX, VOTIFIER_HOST_MAX_LENGTH, votifierKeyTypes, deriveVotifierStatus, votifierStatusLabels, votifierRailLabels };
export type { VotifierStatus, VotifierSettingsView, VotifierDeliveryHealth };

export type VotifierField = "host" | "port" | "keyType" | "secret";
export type VotifierFieldErrors = Partial<Record<VotifierField, string>>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseVotifierHost(raw: unknown): Parsed<string> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, error: "Escribe la IP o el dominio donde escucha Votifier." };
  if (value.length > VOTIFIER_HOST_MAX_LENGTH) return { ok: false, error: "El dominio es demasiado largo." };
  let host: string;
  try {
    host = normalizeHost(value);
  } catch (error) {
    // The shared messages already say what to remove when a scheme or a port is pasted in.
    return { ok: false, error: error instanceof ServerInputError ? error.message : "Escribe un dominio o una IP válidos." };
  }
  // Refused up front so the owner gets a clear answer; the delivery path still runs the SSRF guard
  // on every resolved address, which is what actually protects the network.
  if (!isPublicHost(host) && !localVotifierHostsAllowed()) return { ok: false, error: "Esa dirección no es pública." };
  return { ok: true, value: host };
}

export function parseVotifierPort(raw: unknown): Parsed<number> {
  const value = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (!value) return { ok: true, value: VOTIFIER_DEFAULT_PORT };
  if (!/^\d{1,5}$/.test(value)) return { ok: false, error: "El puerto debe ser un número." };
  const port = Number(value);
  if (port < VOTIFIER_PORT_MIN || port > VOTIFIER_PORT_MAX) {
    return { ok: false, error: `Usa un puerto entre ${VOTIFIER_PORT_MIN} y ${VOTIFIER_PORT_MAX}.` };
  }
  return { ok: true, value: port };
}

export function parseVotifierKeyType(raw: unknown): Parsed<VotifierKeyType> {
  return raw === "token" || raw === "rsa" ? { ok: true, value: raw } : { ok: false, error: "Elige el tipo de clave." };
}

export type VotifierFormInput = { host: unknown; port: unknown; keyType: unknown; secret: unknown };
export type VotifierFormValue = { host: string; port: number; keyType: VotifierKeyType; secret: string | null };

/**
 * Reads the owner's form. An empty secret means "keep the stored one", which only holds while the
 * key type stays the same: a token cannot stand in for a public key.
 */
export function parseVotifierForm(
  input: VotifierFormInput,
  stored: { keyType: VotifierKeyType } | null,
): { ok: true; value: VotifierFormValue } | { ok: false; fieldErrors: VotifierFieldErrors } {
  const host = parseVotifierHost(input.host);
  const port = parseVotifierPort(input.port);
  const keyType = parseVotifierKeyType(input.keyType);
  const fieldErrors: VotifierFieldErrors = {};
  if (!host.ok) fieldErrors.host = host.error;
  if (!port.ok) fieldErrors.port = port.error;
  if (!keyType.ok) fieldErrors.keyType = keyType.error;

  const rawSecret = typeof input.secret === "string" ? input.secret.trim() : "";
  let secret: string | null = null;
  if (keyType.ok) {
    if (rawSecret) {
      if (isValidVotifierSecret(keyType.value, rawSecret)) secret = rawSecret;
      else fieldErrors.secret = keyType.value === "token"
        ? "El token no tiene un formato válido: cópialo entero, sin espacios."
        : "La clave pública debe ser una clave RSA de 2048 bits en base64.";
    } else if (!stored) {
      fieldErrors.secret = keyType.value === "token" ? "Pega el token de NuVotifier." : "Pega la clave pública de Votifier.";
    } else if (stored.keyType !== keyType.value) {
      fieldErrors.secret = keyType.value === "token" ? "Al cambiar de tipo de clave, pega el token nuevo." : "Al cambiar de tipo de clave, pega la clave pública.";
    }
  }

  if (!host.ok || !port.ok || !keyType.ok || fieldErrors.secret) return { ok: false, fieldErrors };
  return { ok: true, value: { host: host.value, port: port.value, keyType: keyType.value, secret } };
}

/** Whether a test ran against exactly what is stored, so its result can be kept for the panel. */
export function testsStoredSettings(
  form: { host: string; port: number; keyType: VotifierKeyType; secret: string | null },
  stored: { host: string; port: number; keyType: VotifierKeyType; secret: string } | null,
) {
  return Boolean(stored)
    && form.host === stored!.host
    && form.port === stored!.port
    && form.keyType === stored!.keyType
    && (form.secret === null || form.secret === stored!.secret);
}

// ── Storage ─────────────────────────────────────────────────────────────────────────────────────


export async function getVotifierSettingsView(serverId: string): Promise<VotifierSettingsView | null> {
  const [row] = await db
    .select({
      host: serverVotifierSettings.host,
      port: serverVotifierSettings.port,
      keyType: serverVotifierSettings.keyType,
      lastTestAt: serverVotifierSettings.lastTestAt,
      lastTestOk: serverVotifierSettings.lastTestOk,
      lastTestError: serverVotifierSettings.lastTestError,
      lastTestLatencyMs: serverVotifierSettings.lastTestLatencyMs,
      updatedAt: serverVotifierSettings.updatedAt,
    })
    .from(serverVotifierSettings)
    .where(eq(serverVotifierSettings.serverId, serverId))
    .limit(1);
  return row ?? null;
}

/** Server-only: the encrypted secret, for the actions that send a test vote. */
export async function getStoredVotifierSettings(serverId: string) {
  const [row] = await db
    .select({
      host: serverVotifierSettings.host,
      port: serverVotifierSettings.port,
      keyType: serverVotifierSettings.keyType,
      secretCiphertext: serverVotifierSettings.secretCiphertext,
    })
    .from(serverVotifierSettings)
    .where(eq(serverVotifierSettings.serverId, serverId))
    .limit(1);
  return row ?? null;
}

/**
 * Saves the connection. `secretCiphertext: null` keeps the stored key. Changing where votes go or
 * the key clears the last test, because it no longer says anything about the new settings.
 */
export async function saveVotifierSettings(
  serverId: string,
  userId: string,
  value: { host: string; port: number; keyType: VotifierKeyType; secretCiphertext: Buffer | null },
) {
  const now = new Date();
  const changed = sql`(${serverVotifierSettings.host} is distinct from excluded.host
    or ${serverVotifierSettings.port} is distinct from excluded.port
    or ${serverVotifierSettings.keyType} is distinct from excluded.key_type
    or ${serverVotifierSettings.secretCiphertext} is distinct from excluded.secret_ciphertext)`;

  if (value.secretCiphertext) {
    await db
      .insert(serverVotifierSettings)
      .values({ serverId, host: value.host, port: value.port, keyType: value.keyType, secretCiphertext: value.secretCiphertext, updatedByUserId: userId, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: serverVotifierSettings.serverId,
        set: {
          host: value.host,
          port: value.port,
          keyType: value.keyType,
          secretCiphertext: value.secretCiphertext,
          updatedByUserId: userId,
          updatedAt: now,
          lastTestAt: sql`case when ${changed} then null else ${serverVotifierSettings.lastTestAt} end`,
          lastTestOk: sql`case when ${changed} then null else ${serverVotifierSettings.lastTestOk} end`,
          lastTestError: sql`case when ${changed} then null else ${serverVotifierSettings.lastTestError} end`,
          lastTestLatencyMs: sql`case when ${changed} then null else ${serverVotifierSettings.lastTestLatencyMs} end`,
        },
      });
    return true;
  }

  const unchanged = and(
    eq(serverVotifierSettings.host, value.host),
    eq(serverVotifierSettings.port, value.port),
  );
  const updated = await db
    .update(serverVotifierSettings)
    .set({
      host: value.host,
      port: value.port,
      updatedByUserId: userId,
      updatedAt: now,
      lastTestAt: sql`case when ${unchanged} then ${serverVotifierSettings.lastTestAt} else null end`,
      lastTestOk: sql`case when ${unchanged} then ${serverVotifierSettings.lastTestOk} else null end`,
      lastTestError: sql`case when ${unchanged} then ${serverVotifierSettings.lastTestError} else null end`,
      lastTestLatencyMs: sql`case when ${unchanged} then ${serverVotifierSettings.lastTestLatencyMs} else null end`,
    })
    // Keeping the key is only meaningful for the same kind of key; the parser already requires a
    // new secret otherwise, and this guard keeps a concurrent switch from pairing them wrongly.
    .where(and(eq(serverVotifierSettings.serverId, serverId), eq(serverVotifierSettings.keyType, value.keyType)))
    .returning({ serverId: serverVotifierSettings.serverId });
  return updated.length > 0;
}

export async function recordVotifierTest(serverId: string, result: { ok: boolean; code: string | null; latencyMs: number; at: Date }) {
  await db
    .update(serverVotifierSettings)
    .set({
      lastTestAt: result.at,
      lastTestOk: result.ok,
      lastTestError: result.ok ? null : result.code?.slice(0, 40) ?? null,
      lastTestLatencyMs: result.latencyMs,
      // A test is not a change to the settings: `updatedAt` keeps dating the saved key.
      updatedAt: sql`${serverVotifierSettings.updatedAt}`,
    })
    .where(eq(serverVotifierSettings.serverId, serverId));
}

export async function deleteVotifierSettings(serverId: string) {
  const removed = await db
    .delete(serverVotifierSettings)
    .where(eq(serverVotifierSettings.serverId, serverId))
    .returning({ serverId: serverVotifierSettings.serverId });
  return removed.length > 0;
}


const DELIVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Votes that tried to reach the plugin in the last 24 h, and how many made it. */
export async function getVotifierDeliveryHealth(serverId: string, settingsUpdatedAt: Date, now = new Date()): Promise<VotifierDeliveryHealth> {
  const since = new Date(now.getTime() - DELIVERY_WINDOW_MS);
  const [[counts], [last]] = await Promise.all([
    db
      .select({
        delivered: sql<number>`count(*) filter (where ${serverVotes.deliveryStatus} = 'delivered')::int`,
        attempted: sql<number>`count(*) filter (where ${serverVotes.deliveryStatus} <> 'not_configured')::int`,
      })
      .from(serverVotes)
      .where(and(eq(serverVotes.serverId, serverId), gte(serverVotes.createdAt, since))),
    db
      .select({ at: serverVotes.createdAt, status: serverVotes.deliveryStatus })
      .from(serverVotes)
      .where(and(eq(serverVotes.serverId, serverId), gte(serverVotes.createdAt, settingsUpdatedAt), ne(serverVotes.deliveryStatus, "not_configured")))
      .orderBy(desc(serverVotes.createdAt))
      .limit(1),
  ]);
  return {
    delivered: counts?.delivered ?? 0,
    attempted: counts?.attempted ?? 0,
    last: last ? { at: last.at, ok: last.status === "delivered" } : null,
  };
}
