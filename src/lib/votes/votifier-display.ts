import type { VotifierKeyType } from "./votifier";

/**
 * The Votifier pieces the owner panel renders in the browser: limits, labels, the status rule and
 * the shapes it receives. Nothing here may import the database or Node's network modules — the
 * storage and validation that do live in `votifier-settings.ts`, which re-exports all of this.
 */

export const VOTIFIER_DEFAULT_PORT = 8192;
export const VOTIFIER_PORT_MIN = 1024;
export const VOTIFIER_PORT_MAX = 65535;
export const VOTIFIER_HOST_MAX_LENGTH = 253;
export const votifierKeyTypes = ["token", "rsa"] as const satisfies readonly VotifierKeyType[];

export type VotifierStatus = "not_configured" | "untested" | "connected" | "failing";

type Signal = { at: Date; ok: boolean } | null;

/**
 * Whatever happened last wins: a failed test after a week of delivered votes means the plugin is
 * down now, and a vote delivered after a failed test means the owner fixed it.
 */
export function deriveVotifierStatus(
  settings: { lastTestAt: Date | null; lastTestOk: boolean | null } | null,
  lastDelivery: Signal = null,
): VotifierStatus {
  if (!settings) return "not_configured";
  const test: Signal = settings.lastTestAt && settings.lastTestOk !== null ? { at: settings.lastTestAt, ok: settings.lastTestOk } : null;
  const latest = [test, lastDelivery]
    .filter((signal): signal is NonNullable<Signal> => signal !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (!latest) return "untested";
  return latest.ok ? "connected" : "failing";
}

export const votifierStatusLabels: Record<VotifierStatus, string> = {
  connected: "Conectado",
  failing: "Sin conexión",
  untested: "Sin probar",
  not_configured: "Sin configurar",
};

/** The sidebar's shorter wording: from there a failing plugin reads as something to go and fix. */
export const votifierRailLabels: Record<VotifierStatus, string> = {
  connected: "Conectado",
  failing: "Con errores",
  untested: "Sin probar",
  not_configured: "Sin configurar",
};

/** What the panel may see. The ciphertext never leaves this module through it. */
export type VotifierSettingsView = {
  host: string;
  port: number;
  keyType: VotifierKeyType;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestLatencyMs: number | null;
  updatedAt: Date;
};

export type VotifierDeliveryHealth = {
  delivered: number;
  attempted: number;
  /** The latest delivery attempt since the settings were last saved, for the status pill. */
  last: { at: Date; ok: boolean } | null;
};
