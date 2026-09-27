import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { OG_IMAGES } from "../src/lib/brand/og.ts";
import {
  displayHost,
  formatRating,
  isStaticCardKey,
  OG_SIZE,
  serverCardPath,
  serverInitial,
  serverNameFontSize,
  serverVoteCardPath,
  staticCardPath,
  staticCards,
} from "../src/lib/og/model.ts";

function pageFiles() {
  const root = path.resolve("src/app");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith("page.tsx"))
    .map((entry) => path.join("src/app", entry));
}

test("the default share card is the static brand card, at the size platforms crop to", () => {
  // Facebook, X and WhatsApp all crop to 1.91:1; anything else gets letterboxed or cut.
  assert.deepEqual(OG_SIZE, { width: 1200, height: 630 });
  const [image] = OG_IMAGES as Array<{ url: string; width: number; height: number; alt: string }>;
  assert.equal(image.url, staticCardPath("marca"));
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.ok(image.alt.length > 0);
  assert.ok(isStaticCardKey("marca"), "the default card must be one the static route renders");
});

test("every card path is served by a route under src/app/og", () => {
  assert.ok(existsSync(path.resolve("src/app/og/[page]/route.tsx")));
  assert.ok(existsSync(path.resolve("src/app/og/inicio/route.tsx")));
  assert.ok(existsSync(path.resolve("src/app/og/servers/[slug]/route.tsx")));
  assert.ok(existsSync(path.resolve("src/app/og/servers/[slug]/votar/route.tsx")));
  assert.equal(serverCardPath("aldea-norte"), "/og/servers/aldea-norte");
  assert.equal(serverVoteCardPath("aldea-norte"), "/og/servers/aldea-norte/votar");
  // A static key must not shadow the dynamic cards that live beside it under /og/.
  assert.ok(!isStaticCardKey("servers") && !isStaticCardKey("inicio"));
  assert.ok(!isStaticCardKey("toString"), "only own keys count as cards");
  for (const key of Object.keys(staticCards)) assert.match(staticCardPath(key as keyof typeof staticCards), /^\/og\/[a-z-]+$/);
});

test("server names step down in size as they grow, and the card text reads in Spanish", () => {
  assert.equal(serverNameFontSize("Aldea Norte"), 84);
  assert.ok(serverNameFontSize("Un nombre de servidor bastante largo") < serverNameFontSize("Aldea Norte"));
  assert.equal(serverNameFontSize("x".repeat(80)), 44);
  assert.equal(formatRating(4.56), "4,6");
  assert.equal(formatRating(4), "4,0");
  assert.equal(formatRating(null), null);
  assert.equal(serverInitial("  élite smp"), "É");
  assert.equal(displayHost("https://www.opinacraft.com"), "opinacraft.com");
  assert.equal(displayHost("not a url"), "opinacraft.com");
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
