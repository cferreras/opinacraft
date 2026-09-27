import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";

import { OG_SIZE } from "./model";

type FontWeight = 500 | 700 | 800;
type OgFont = { name: string; data: Buffer; weight: FontWeight; style: "normal" };

// Static instances, not the variable font the site loads: Satori reads neither woff2 nor variation
// axes. The directory is traced into the /og routes by `outputFileTracingIncludes`.
const fontDir = path.join(process.cwd(), "src/lib/og/fonts");
const fontFiles: Array<{ name: string; file: string; weight: FontWeight }> = [
  { name: "Manrope", file: "Manrope-Medium.ttf", weight: 500 },
  { name: "Manrope", file: "Manrope-Bold.ttf", weight: 700 },
  { name: "Manrope", file: "Manrope-ExtraBold.ttf", weight: 800 },
  { name: "JetBrains Mono", file: "JetBrainsMono-Medium.ttf", weight: 500 },
];

let fonts: Promise<OgFont[]> | undefined;

function loadFonts() {
  fonts ??= Promise.all(
    fontFiles.map(async ({ name, file, weight }) => ({ name, weight, style: "normal" as const, data: await readFile(path.join(fontDir, file)) })),
  ).catch((error: unknown) => {
    // A failed read must not be remembered: the next card tries again.
    fonts = undefined;
    throw error;
  });
  return fonts;
}

export async function renderOgCard(element: ReactElement, { cacheControl }: { cacheControl?: string } = {}) {
  return new ImageResponse(element, {
    ...OG_SIZE,
    fonts: await loadFonts(),
    // ImageResponse marks its output immutable for a year by default, which is right for a
    // build-time image and wrong for one that prints this month's votes.
    headers: cacheControl ? { "Cache-Control": cacheControl } : undefined,
  });
}
