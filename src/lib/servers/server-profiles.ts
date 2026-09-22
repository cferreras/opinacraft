/**
 * What a server looks like to Jev when it is being judged against a search query.
 *
 * This is deliberately not `PublicServer`. A profile is the smallest description that still lets
 * someone decide "is this what the visitor asked for", and every field it leaves out is one the
 * model would have to read past on all three hundred servers, once per query.
 *
 * **Opinions are excluded on purpose.** Reviews are what other people think of a server, not what
 * the server is, and a search for "survival tranquilo" must not quietly become a search for
 * "survival tranquilo that happens to be well rated" — the catalog already orders by rating, and
 * conflating the two would hide a new server that matches perfectly. So no `reviewAverage`, no
 * `reviewCount` (both of which live only on `CatalogServer`), and no review text, which is in a
 * different table entirely.
 *
 * Identifiers are excluded for a different reason: a slug carries no meaning a description does not
 * already carry, and an id is a number for the model to ignore. The id travels beside the profile
 * as a reference, never inside it.
 */

import { createHash } from "node:crypto";

import { gameModeLabel } from "./game-modes";
import { serverCountryLabel } from "./countries";
import { accountModeLabel } from "./access";

/** The server as the model sees it: prose and labels, not slugs and enums. */
export type ServerProfile = {
  nombre: string;
  descripcion: string | null;
  modalidades: string[];
  pais: string | null;
  acceso: string;
  ediciones: string[];
  version: string | null;
  jugadores: { actuales: number | null; maximo: number | null } | null;
  estado: string;
};

/** A profile plus the id it belongs to. The id is never part of what is judged. */
export type IdentifiedServerProfile = {
  serverId: string;
  profile: ServerProfile;
  /** Changes whenever anything the model was shown changes. See {@link serverProfileHash}. */
  profileHash: string;
};

/**
 * The shape this module reads from. Structural rather than `PublicServer` so the profile can be
 * built from a narrow SQL select without hydrating media, endpoints and review summaries that
 * would be thrown away.
 */
export type ServerProfileSource = {
  id: string;
  name: string;
  description: string | null;
  country: string | null;
  accessType: "open" | "whitelist";
  accountMode: "premium_only" | "premium_and_non_premium";
  gameModes: readonly string[];
  editions: readonly string[];
  monitorVersion: string | null;
  playersCurrent: number | null;
  playersMax: number | null;
  healthStatus: "unknown" | "online" | "offline";
};

const healthLabels: Record<ServerProfileSource["healthStatus"], string> = {
  online: "En línea",
  offline: "Fuera de línea",
  unknown: "Sin datos recientes",
};

function accessLabel(source: ServerProfileSource) {
  if (source.accessType === "whitelist") return "Whitelist: hay que solicitar acceso";
  return accountModeLabel(source.accountMode);
}

export function buildServerProfile(source: ServerProfileSource): ServerProfile {
  return {
    nombre: source.name,
    descripcion: source.description,
    // Labels rather than slugs: "Técnico" is a word the query can be compared against, `tecnico`
    // is an internal identifier that happens to look like one.
    modalidades: source.gameModes.map((slug) => gameModeLabel(slug)),
    pais: source.country ? serverCountryLabel(source.country) : null,
    acceso: accessLabel(source),
    ediciones: [...source.editions],
    version: source.monitorVersion,
    // Live numbers are what "pocos jugadores" is really asking about, so they are part of the
    // profile even though they move. The hash below is what keeps a moved number from silently
    // invalidating every cached score — see `serverProfileHash`.
    jugadores: source.playersCurrent === null && source.playersMax === null
      ? null
      : { actuales: source.playersCurrent, maximo: source.playersMax },
    estado: healthLabels[source.healthStatus],
  };
}

/**
 * Player counts change every few minutes, and a hash over the raw numbers would expire every
 * cached score in the catalog several times an hour for no gain in answer quality: nothing a
 * visitor asks is sensitive to 41 players versus 43. So the hash sees a *band*, and only a move
 * between bands counts as the profile having changed.
 */
export const PLAYER_BANDS = [0, 5, 20, 50, 200] as const;

export function playerBand(players: number | null) {
  if (players === null) return "desconocido";
  const index = PLAYER_BANDS.findLastIndex((floor) => players >= floor);
  return index < 0 ? "desconocido" : `banda-${index}`;
}

/**
 * Identifies what the model was shown, so a cached score can be invalidated by the thing that
 * would change the answer rather than by a clock. Editing a description re-scores that one server;
 * everyone else keeps their cached score.
 */
export function serverProfileHash(profile: ServerProfile): string {
  const stable = {
    ...profile,
    jugadores: profile.jugadores
      ? { actuales: playerBand(profile.jugadores.actuales), maximo: playerBand(profile.jugadores.maximo) }
      : null,
  };
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex");
}

export function identifyProfile(source: ServerProfileSource): IdentifiedServerProfile {
  const profile = buildServerProfile(source);
  return { serverId: source.id, profile, profileHash: serverProfileHash(profile) };
}
