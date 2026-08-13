import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import sharp from "sharp";

const brandMarkPath = path.resolve("public/brand/opinacraft-server-mark.webp");
const faviconPath = path.resolve("src/app/favicon.ico");

type IcoEntry = {
  width: number;
  height: number;
  bytes: Buffer;
};

function readIcoEntries(file: Buffer): IcoEntry[] {
  assert.equal(file.readUInt16LE(0), 0, "ICO reserved field must be zero");
  assert.equal(file.readUInt16LE(2), 1, "favicon must be an ICO image");

  const count = file.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const width = file[offset] || 256;
    const height = file[offset + 1] || 256;
    const byteLength = file.readUInt32LE(offset + 8);
    const imageOffset = file.readUInt32LE(offset + 12);

    return {
      width,
      height,
      bytes: file.subarray(imageOffset, imageOffset + byteLength),
    };
  });
}

test("the navigation brand mark is a compact transparent WebP", async () => {
  assert.ok(existsSync(brandMarkPath), "the optimized brand mark must exist");

  const metadata = await sharp(brandMarkPath).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
  assert.equal(metadata.hasAlpha, true);
  assert.ok(statSync(brandMarkPath).size <= 100_000, "the brand mark must stay under 100 KB");
});

test("the favicon contains matching 16, 32 and 48 pixel brand marks", async () => {
  assert.ok(existsSync(brandMarkPath), "the optimized brand mark must exist");

  const entries = readIcoEntries(readFileSync(faviconPath));
  assert.deepEqual(
    entries
      .map(({ width, height }) => [width, height])
      .sort(([aWidth, aHeight], [bWidth, bHeight]) => aWidth - bWidth || aHeight - bHeight),
    [[16, 16], [32, 32], [48, 48]],
  );

  for (const entry of entries) {
    const [actual, expected] = await Promise.all([
      sharp(entry.bytes).ensureAlpha().raw().toBuffer(),
      sharp(brandMarkPath).resize(entry.width, entry.height).ensureAlpha().raw().toBuffer(),
    ]);
    assert.deepEqual(actual, expected, `${entry.width}px favicon must match the brand mark`);
  }
});
