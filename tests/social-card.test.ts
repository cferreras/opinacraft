import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

const ogImagePath = path.resolve("public/brand/og-default.jpg");

function pageFiles() {
  const root = path.resolve("src/app");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith("page.tsx"))
    .map((entry) => path.join("src/app", entry));
}

test("the default share card matches what the metadata advertises", async () => {
  assert.ok(existsSync(ogImagePath), "the default Open Graph image must exist");

  const metadata = await sharp(ogImagePath).metadata();
  // Facebook, X and WhatsApp all crop to 1.91:1; anything else gets letterboxed or cut.
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);

  // Some WhatsApp builds skip the preview entirely once the image passes a few
  // hundred KB, so the card is kept well inside that.
  assert.ok(statSync(ogImagePath).size <= 200_000, "the share card must stay under 200 KB");

  const source = readFileSync(path.resolve("src/lib/brand/og.ts"), "utf8");
  assert.match(source, /url: "\/brand\/og-default\.jpg"/);
  assert.match(source, /width: 1200/);
  assert.match(source, /height: 630/);
});

test("every page that declares openGraph also declares its images", () => {
  // Next merges `openGraph` shallowly: a page that declares the object drops the one it
  // inherits from the root layout, image included, and then shares with no card at all.
  const declaring = pageFiles()
    .map((file) => ({ file, source: readFileSync(path.resolve(file), "utf8") }))
    .filter(({ source }) => source.includes("openGraph:"));

  assert.ok(declaring.length >= 4, `expected the pages declaring openGraph to be found, got ${declaring.length}`);

  for (const { file, source } of declaring) {
    for (const block of source.matchAll(/openGraph: \{/g)) {
      const rest = source.slice(block.index);
      const body = rest.slice(0, rest.indexOf("}") + 1);
      assert.match(body, /\bimages:/, `${file}: this openGraph block has no images, so the route shares without a card`);
    }
  }
});

test("no opengraph-image file convention shadows the per-post covers", () => {
  // File-based metadata outranks config-based metadata in Next, so an opengraph-image file
  // under src/app would silently replace every blog post's own cover with the default card.
  const conventions = readdirSync(path.resolve("src/app"), { recursive: true, encoding: "utf8" })
    .filter((entry) => path.basename(entry).startsWith("opengraph-image"));

  assert.deepEqual(conventions, [], "declare share images in metadata, not as an opengraph-image file");
});

test("the metadata base resolves the share card to an absolute URL", () => {
  // og:image must be absolute. Without metadataBase Next falls back to localhost and every
  // shared link advertises an image nobody else can fetch.
  const source = readFileSync(path.resolve("src/app/layout.tsx"), "utf8");
  assert.match(source, /metadataBase: new URL\(/);
  assert.match(source, /twitter: \{ card: "summary_large_image" \}/);
});
