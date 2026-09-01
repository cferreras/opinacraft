import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// A route whose resource does not exist answers 200, not 404: cacheComponents streams
// the static shell before notFound() runs, so the status is already committed. Next
// rejects `dynamicParams = false`, the usual fix, outright. noindex on the not-found
// branch is what keeps the resulting soft 404 out of the search index, so it must not
// be dropped from either route.
const routes = [
  { file: "src/app/blog/[slug]/page.tsx", title: "Artículo no encontrado | OpinaCraft" },
  { file: "src/app/servers/[slug]/page.tsx", title: "Servidor no encontrado | OpinaCraft" },
];

test("the not-found metadata of every dynamic route is noindex", () => {
  for (const { file, title } of routes) {
    const source = readFileSync(path.resolve(file), "utf8");
    const branch = source.slice(source.indexOf(title));

    assert.ok(branch.length > 0, `${file}: no not-found metadata branch found`);
    assert.match(
      branch.slice(0, 200),
      /robots: \{ index: false/,
      `${file}: the not-found branch must be noindex or the soft 404 gets indexed`,
    );
  }
});

test("no dynamic route reintroduces dynamicParams", () => {
  // It fails the build under cacheComponents rather than fixing the status code.
  for (const { file } of routes) {
    const source = readFileSync(path.resolve(file), "utf8");
    assert.equal(/^export const dynamicParams/m.test(source), false, `${file}: dynamicParams breaks the build`);
  }
});
