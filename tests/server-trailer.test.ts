import assert from "node:assert/strict";
import test from "node:test";

import { canonicalTrailerUrl, parseYouTubeTrailer } from "../src/lib/servers/trailer.ts";
import { normalizeTrailerUrl, ServerInputError } from "../src/lib/servers/validation.ts";

const ID = "dQw4w9WgXcQ";

test("reads the id from every YouTube link shape", () => {
  for (const link of [
    `https://www.youtube.com/watch?v=${ID}&t=30s`,
    `youtu.be/${ID}?si=abc`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ]) {
    assert.deepEqual(parseYouTubeTrailer(link), { id: ID, isShort: false }, link);
  }
});

test("detects Shorts", () => {
  assert.deepEqual(parseYouTubeTrailer(`https://youtube.com/shorts/${ID}?feature=share`), { id: ID, isShort: true });
});

test("rejects anything that is not a YouTube video", () => {
  for (const link of [
    "",
    "https://example.com/watch?v=" + ID,
    "https://youtube.com.evil.com/watch?v=" + ID,
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/@canal",
    "javascript:alert(1)",
    `https://user:pw@www.youtube.com/watch?v=${ID}`,
  ]) {
    assert.equal(parseYouTubeTrailer(link), null, link);
  }
});

test("normalizeTrailerUrl stores a canonical link and reports the field on error", () => {
  assert.equal(normalizeTrailerUrl(`youtu.be/${ID}`), canonicalTrailerUrl({ id: ID, isShort: false }));
  assert.equal(normalizeTrailerUrl(`youtube.com/shorts/${ID}`), `https://www.youtube.com/shorts/${ID}`);
  assert.equal(normalizeTrailerUrl("   "), null);
  assert.throws(() => normalizeTrailerUrl("https://vimeo.com/123"), (error) => error instanceof ServerInputError && error.field === "trailerUrl");
});
