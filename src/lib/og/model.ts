import { siteUrl } from "@/lib/seo/site-url";

/**
 * The share cards: 1200×630 PNGs drawn by `next/og` on the dark "Noche" look. This module is the
 * part with no JSX, so the node test runner can load it: colours, the copy of the fixed pages, and
 * the small decisions (type size, number format) that every card shares.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Tokens of the dark look, as hex because Satori does not read oklch. */
export const ogColors = {
  ground: "#0b1310",
  surface: "#13201a",
  line: "rgba(255,255,255,0.08)",
  text: "#eaf3ee",
  muted: "#9aaba2",
  accent: "#2fbf78",
  accentInk: "#6fe0a6",
  onAccent: "#07130d",
  rating: "#f2c14e",
  offline: "#f07a6a",
} as const;

/** The host the cards print, without the `www.` a reader never types. */
export function displayHost(base = siteUrl) {
  try {
    return new URL(base).host.replace(/^www\./, "");
  } catch {
    return "opinacraft.com";
  }
}

/**
 * Server names run to 80 characters. The card keeps one size per band of length rather than
 * measuring glyphs: a short name gets the poster size, a long one steps down and may wrap to two.
 */
export function serverNameFontSize(name: string) {
  const length = [...name.trim()].length;
  if (length <= 14) return 84;
  if (length <= 20) return 68;
  if (length <= 28) return 56;
  return 44;
}

/** "4,6" — one decimal and a Spanish comma, the way the ficha prints it. */
export function formatRating(average: number | null) {
  if (average === null || !Number.isFinite(average)) return null;
  return average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatCount(value: number) {
  return value.toLocaleString("es-ES");
}

export function serverInitial(name: string) {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

/**
 * Crawlers keep their own copy of a card for days, so a long CDN life costs nothing they would not
 * already do; the stale window keeps a busy server from rendering the same card on every share.
 */
export const dynamicCardCacheControl = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

export function serverCardPath(slug: string) {
  return `/og/servers/${encodeURIComponent(slug)}`;
}

export function serverVoteCardPath(slug: string) {
  return `/og/servers/${encodeURIComponent(slug)}/votar`;
}

export const homeCardPath = "/og/inicio";

export const homeCardTitle = "Servidores de Minecraft en español";

/** The pages whose card never changes, keyed by the segment under `/og/`. */
export const staticCards = {
  // The site's default card: the home card without the month's list, for every route that has
  // no card of its own (sign-in, 404…). Static, so it never depends on the database.
  marca: { kind: "home", path: "/" },
  blog: { kind: "blog", path: "/blog" },
  "quienes-somos": { kind: "about", path: "/quienes-somos" },
  contacto: { kind: "contact", path: "/contact" },
  publicar: { kind: "publish", path: "/servers/new" },
  privacidad: { kind: "generic", path: "/privacy", title: "Política de privacidad" },
  terminos: { kind: "generic", path: "/terms", title: "Términos de uso" },
} as const satisfies Record<string, { kind: string; path: string; title?: string }>;

export type StaticCardKey = keyof typeof staticCards;

export function isStaticCardKey(value: string): value is StaticCardKey {
  return Object.hasOwn(staticCards, value);
}

export function staticCardPath(key: StaticCardKey) {
  return `/og/${key}`;
}

/** One `openGraph.images` entry for a generated card. */
export function ogCardImage(path: string, alt: string) {
  return [{ url: path, width: OG_SIZE.width, height: OG_SIZE.height, alt, type: "image/png" }];
}
