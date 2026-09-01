import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Every page that renders the site header sits in the same frame, so the distance from the navbar
// to the first thing on the page never depends on which route you landed on. The auth shell is the
// documented exception: it centres its card in the viewport instead of hanging it from the top.
const topPadding = "pt-9";

function pageFiles() {
  const root = path.resolve("src/app");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith("page.tsx"))
    .map((entry) => path.join("src/app", entry));
}

test("every framed page keeps the same distance to the navbar", () => {
  const framed = pageFiles()
    .map((file) => ({ file, source: readFileSync(path.resolve(file), "utf8") }))
    .filter(({ source }) => source.includes("<SiteHeader"));

  assert.ok(framed.length >= 8, `expected the framed pages to be found, got ${framed.length}`);

  for (const { file, source } of framed) {
    // A page may also render a centred <main> for its loading or signed-out state; the framed one
    // is the container that centres itself with mx-auto.
    const mains = [...source.matchAll(/<main className="([^"]*)"/g)].map((match) => match[1]).filter((classes) => classes.includes("mx-auto"));
    assert.ok(mains.length > 0, `${file}: no framed <main className="mx-auto …"> to check`);

    for (const classes of mains) {
      assert.ok(classes.includes(topPadding), `${file}: main should use ${topPadding}, got "${classes}"`);
      assert.equal(/\bpt-(?!9\b)\d/.test(classes), false, `${file}: a second top padding fights ${topPadding}`);
      assert.equal(/\bpy-\d/.test(classes), false, `${file}: py-* would override ${topPadding}`);
    }
  }
});

test("the breadcrumb adds no top padding of its own", () => {
  const source = readFileSync(path.resolve("src/components/breadcrumbs.tsx"), "utf8");

  // The frame already spaces it off the header; py-4 here would double the gap on detail pages.
  assert.match(source, /\bpb-4\b/);
  assert.equal(/\bpy-\d/.test(source), false, "breadcrumbs must not add symmetric padding");
});
