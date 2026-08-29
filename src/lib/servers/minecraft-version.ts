/**
 * Version is the one catalog facet nobody types: it comes from the monitor's own ping, which
 * reports strings like "Paper 1.21.4", "1.20.1" or "Requires MC 1.8" depending on the software.
 *
 * We only ever expose the major version ("1.21"), because that is what a player checks before
 * joining and it keeps the filter from splitting a server into a new option on every patch.
 * A multiversion proxy that advertises "1.8-1.21" belongs to both ends of its range, so every
 * version found in the string counts — {@link minecraftVersionsIn} and the SQL predicate in
 * `queries.ts` share that rule.
 */
const VERSION_PATTERN = /\d+\.\d+/g;

/** The same expression in POSIX form, for the catalog's `regexp_matches` filter. */
export const MINECRAFT_VERSION_SQL_PATTERN = "([0-9]+\\.[0-9]+)";

/** Every distinct major version named in a reported version string, in the order they appear. */
export function minecraftVersionsIn(raw: string | null | undefined) {
  if (!raw) return [];
  return [...new Set(raw.match(VERSION_PATTERN) ?? [])];
}

/**
 * The version to show for a server. For a range ("1.8-1.21") that is the newest end, since a
 * proxy's headline is what it supports today, not the legacy client it still tolerates.
 */
export function primaryMinecraftVersion(raw: string | null | undefined) {
  const versions = minecraftVersionsIn(raw);
  if (versions.length === 0) return null;
  return versions.reduce((highest, version) => (compareMinecraftVersions(version, highest) > 0 ? version : highest));
}

/** Newest first when used as `versions.sort((a, b) => -compareMinecraftVersions(a, b))`. */
export function compareMinecraftVersions(a: string, b: string) {
  const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

export function sortMinecraftVersions(versions: readonly string[]) {
  return [...new Set(versions)].sort((a, b) => compareMinecraftVersions(b, a));
}

export function isMinecraftVersion(value: string | undefined): value is string {
  return value !== undefined && /^\d{1,3}\.\d{1,3}$/.test(value);
}

/** Guards the query string: only a bare major version reaches the SQL filter. */
export function parseVersionParam(value: string | undefined) {
  const version = value?.trim();
  return isMinecraftVersion(version) ? version : undefined;
}
