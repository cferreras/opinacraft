import type { ServerMedia } from "@/lib/servers/queries";

const LOGO_TIMEOUT_MS = 2_500;
const LOGO_MAX_BYTES = 1_000_000;

/**
 * A server's logo as a PNG data URI the card can draw, or null to fall back to its initial.
 *
 * Logos are stored as WebP, which Satori cannot decode, so each one is re-encoded here. Anything
 * that goes wrong — a slow store, a missing object, a file sharp rejects — costs the card its logo
 * and nothing else.
 */
export async function serverLogoDataUri(media: readonly ServerMedia[], size: number): Promise<string | null> {
  const logo = media.find((item) => item.kind === "logo");
  if (!logo) return null;
  try {
    const response = await fetch(logo.url, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > LOGO_MAX_BYTES) return null;
    const { default: sharp } = await import("sharp");
    const png = await sharp(bytes).resize(size * 2, size * 2, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error("[og] server logo unavailable", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
