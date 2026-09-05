/**
 * Version is the one catalog facet nobody types: it comes from the monitor's own ping, which
 * reports strings like "Paper 1.21.4", "Purpur 26.2", "1.20.1" or "Requires MC 1.8" depending
 * on the software.
 *
 * The filter bar offers the full strings the monitor has actually seen ("Purpur 26.2" next to
 * "26.2"), because collapsing them to the bare major ("26.2") hides the software players look
 * for in the dropdown. A bare major still matches every string that names it, so filtering by
 * "26.2" keeps including "Purpur 26.2" — selecting the full string only narrows to that exact
 * report. A multiversion proxy that advertises "1.8-1.21" belongs to both ends of its range,
 * so every version found in the string counts — {@link minecraftVersionsIn} and the SQL
 * predicate in `queries.ts` share that rule.
 */
const VERSION_PATTERN = /\d+\.\d+/g;

/** The same expression in POSIX form, for the catalog's `regexp_matches` filter. */
export const MINECRAFT_VERSION_SQL_PATTERN = "([0-9]+\\.[0-9]+)";

/**
 * Padding a server's software can leave around its reported version. The set is spelled out
 * instead of leaning on `String.trim()` (or SQL's `btrim`, which strips ordinary spaces only)
 * because the same normalization runs twice: here, to build the option the filter bar shows, and
 * in the SQL predicate that matches that option back against the stored report. A character the
 * two disagreed on would be an option that matches no server.
 */
const REPORTED_PADDING_CHARACTERS = " \t\n\r\f\v";
const REPORTED_PADDING = new RegExp(`^[${REPORTED_PADDING_CHARACTERS}]+|[${REPORTED_PADDING_CHARACTERS}]+$`, "g");

/** The same expression in POSIX form, for the catalog's `regexp_replace` filter. */
export const REPORTED_PADDING_SQL_PATTERN = `^[${REPORTED_PADDING_CHARACTERS}]+|[${REPORTED_PADDING_CHARACTERS}]+$`;

/** Strips exactly the padding {@link REPORTED_PADDING_SQL_PATTERN} strips in Postgres. */
export function withoutReportedPadding(value: string) {
  return value.replace(REPORTED_PADDING, "");
}

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

/**
 * Full strings the monitor can plausibly report: letters, digits, spaces, dots, dashes and
 * underscores, always naming at least one major version so query-string junk never reaches SQL.
 * Covers "26.2", "Purpur 26.2", "Paper 1.21.7" and ranges like "1.8-1.21".
 */
export function isFullMinecraftVersion(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length >= 1 &&
    value.length <= 100 &&
    /^[A-Za-z0-9 ._\-]+$/.test(value) &&
    minecraftVersionsIn(value).length > 0
  );
}

/**
 * Guards the query string: a bare major ("26.2") keeps its compatibility grouping, and a full
 * reported string ("Purpur 26.2") narrows to that exact report. Anything else means no filter.
 */
export function parseVersionParam(value: string | undefined) {
  const version = value === undefined ? undefined : withoutReportedPadding(value);
  if (!version) return undefined;
  if (isMinecraftVersion(version)) return version;
  return isFullMinecraftVersion(version) ? version : undefined;
}

/**
 * Whether a reported version answers to the filter the visitor picked. A bare major ("26.2") keeps
 * its compatibility grouping — every string that names it counts, so "Purpur 26.2" answers to
 * "26.2" and a "1.8-1.21" proxy answers to both ends — while a full report narrows to itself. A
 * server the monitor has no fresh version for answers to nothing: an option that lists it and a
 * filter that hides it would disagree.
 */
export function reportedVersionMatches(reported: string | null | undefined, filter: string) {
  if (!reported) return false;
  if (isMinecraftVersion(filter)) return minecraftVersionsIn(reported).includes(filter);
  return withoutReportedPadding(reported) === filter;
}

/**
 * The options the filter bar offers, out of whatever the monitor reported. Every candidate goes
 * through {@link parseVersionParam}, the same guard the query string passes, so no option can be
 * offered that the page would then discard — a filter that silently does nothing is worse than a
 * missing one. Newest first: compare by the headline (newest) major each string names, then
 * alphabetically so "26.2" and "Purpur 26.2" stay stable side by side instead of collapsing into
 * a single option.
 */
export function catalogVersionOptions(versions: readonly (string | null)[]) {
  const parsed = versions.map((version) => parseVersionParam(version ?? undefined)).filter((version): version is string => version !== undefined);
  return [...new Set(parsed)].sort((a, b) => {
    const primaryA = primaryMinecraftVersion(a);
    const primaryB = primaryMinecraftVersion(b);
    if (primaryA && primaryB) {
      const byPrimary = compareMinecraftVersions(primaryB, primaryA);
      if (byPrimary !== 0) return byPrimary;
    } else if (primaryA) {
      return -1;
    } else if (primaryB) {
      return 1;
    }
    return a.localeCompare(b);
  });
}
