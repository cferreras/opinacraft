import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("keeps system catalog pills icon-led while game modes stay text-only", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");
  const modePillSource = source.slice(
    source.indexOf("function ModePill"),
    source.indexOf("function TagPill"),
  );
  const tagPillSource = source.slice(
    source.indexOf("function TagPill"),
    source.indexOf("function PlatformCell"),
  );
  const gameModesStart = source.indexOf("server.gameModes.slice(0, 2).map");
  const gameModesSource = source.slice(gameModesStart, source.indexOf("\n", gameModesStart));

  assert.match(source, /<TagPill icon=\{<ClipboardCheck aria-hidden="true" className="size-3" \/>\}/);
  assert.match(source, /<TagPill icon=\{<Users aria-hidden="true" className="size-3" \/>\}/);
  assert.match(tagPillSource, /<Badge variant="outline" className="text-\[0\.625rem\]">\s*\{icon\}\s*\{children\}\s*<\/Badge>/);
  // A mode is what a visitor picks by, so it is tinted rather than outlined — and never icon-led.
  assert.match(modePillSource, /<Badge variant="outline" className="border-transparent bg-accent text-\[0\.625rem\] font-semibold text-primary-ink">\s*\{children\}\s*<\/Badge>/);
  assert.doesNotMatch(modePillSource, /\{icon\}/);
  assert.match(gameModesSource, /<ModePill>\{gameModeLabel\(mode\)\}<\/ModePill>/);
  assert.doesNotMatch(gameModesSource, /icon=|ClipboardCheck|Users|<svg/);
  assert.doesNotMatch(source, /<Badge className="text-\[0\.625rem\]">/);
  assert.doesNotMatch(source, /bg-success-soft/);
});

test("keeps client and version in their own column instead of the tag pills", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");
  const tagsStart = source.indexOf("const tags:");
  const tagsSource = source.slice(tagsStart, source.indexOf("];", tagsStart));

  assert.doesNotMatch(tagsSource, /PlatformCell|editions|monitor\.version/, "the tag list is about what the server is, not what it runs");
  assert.match(source, /<PlatformCell editions=\{editions\} version=\{server\.monitor\.version\} \/>/);
  // The compact card already prints client and version in its metrics strip, so the column is desktop-only.
  assert.equal(source.match(/<PlatformCell /g)?.length, 1);
});

test("keeps access requests on the server page instead of catalog rows", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");

  assert.doesNotMatch(source, /Solicitar acceso/);
  assert.doesNotMatch(source, /server\.accessFormUrl/);
});
