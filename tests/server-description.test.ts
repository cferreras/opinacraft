import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

test("normalizes server descriptions to one readable line", async () => {
  const helperPath = path.resolve("src/lib/servers/description.ts");

  assert.equal(existsSync(helperPath), true, "server descriptions should have a shared normalizer");
  const { normalizeServerDescription } = await import(pathToFileURL(helperPath).href);

  assert.equal(
    normalizeServerDescription("  Una comunidad\n\n\npara\t	jugar.  "),
    "Una comunidad para jugar.",
  );
  assert.equal(normalizeServerDescription(" \n\t "), null);
});

test("reports when a description exceeds its clamped preview", async () => {
  const helperPath = path.resolve("src/lib/servers/description.ts");
  assert.equal(existsSync(helperPath), true, "description overflow should have a shared helper");
  const { descriptionHasOverflow } = await import(pathToFileURL(helperPath).href);

  assert.equal(descriptionHasOverflow(72, 72), false);
  assert.equal(descriptionHasOverflow(73, 72), true);
});
