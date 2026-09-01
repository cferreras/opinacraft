export const SERVER_DESCRIPTION_MAX_LENGTH = 2_000;

export function normalizeServerDescription(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized || null;
}

export function descriptionHasOverflow(scrollHeight: number, clientHeight: number) {
  return scrollHeight > clientHeight;
}

/** Google shows roughly 160 characters of a description; the rest is spent, not shown. */
export const SERVER_META_DESCRIPTION_MAX_LENGTH = 155;

/** Cuts at a word boundary so a truncated blurb never ends mid-word. */
export function truncateAtWord(value: string, max: number) {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped).replace(/[\s,.;:·-]+$/, "")}…`;
}

/**
 * The SERP snippet, generated from the fields the ficha already holds.
 *
 * Passing the owner's own blurb straight through produced descriptions that ran past the cut and
 * ended on whatever the owner happened to be saying at character 160. Facts first -- edition,
 * modality, admission, rating -- and the blurb only fills whatever room is left, so every listing
 * gets a unique description that survives the truncation at scale.
 */
export function buildServerMetaDescription({
  name,
  editions,
  gameModes,
  accessLabel,
  accountLabel,
  average,
  reviewCount,
  ownerDescription,
}: {
  name: string;
  editions: readonly string[];
  gameModes: readonly string[];
  accessLabel: string;
  accountLabel: string;
  average: number | null;
  reviewCount: number;
  ownerDescription: string | null;
}) {
  const editionPart = editions.length ? `servidor de Minecraft ${editions.join(" y ")}` : "servidor de Minecraft";
  const modePart = gameModes.length ? ` de ${gameModes.slice(0, 2).join(" y ").toLowerCase()}` : "";
  const facts = `${name}: ${editionPart}${modePart}. ${accessLabel}, ${accountLabel.toLowerCase()}.`;
  const rating =
    average !== null && reviewCount > 0
      ? ` ${average.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sobre 5 con ${reviewCount} ${reviewCount === 1 ? "opinión" : "opiniones"}.`
      : "";

  const lead = truncateAtWord(`${facts}${rating}`, SERVER_META_DESCRIPTION_MAX_LENGTH);
  const room = SERVER_META_DESCRIPTION_MAX_LENGTH - lead.length - 1;
  const blurb = normalizeServerDescription(ownerDescription);
  // The owner's words are worth keeping when they fit whole; a two-word tail of them is not.
  if (!blurb || room < 40) return lead;
  return `${lead} ${truncateAtWord(blurb, room)}`;
}
