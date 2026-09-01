import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServerMetaDescription,
  SERVER_META_DESCRIPTION_MAX_LENGTH,
  truncateAtWord,
} from "@/lib/servers/description";

const base = {
  name: "Ferreras SMP",
  editions: ["Java"],
  gameModes: ["Survival"],
  accessLabel: "Whitelist",
  accountLabel: "Premium y no-premium",
  average: 5,
  reviewCount: 3,
  ownerDescription: null as string | null,
};

test("the snippet leads with the structured facts", () => {
  const description = buildServerMetaDescription(base);

  assert.ok(description.startsWith("Ferreras SMP:"), description);
  assert.match(description, /Java/);
  assert.match(description, /survival/);
  assert.match(description, /Whitelist/);
  assert.match(description, /5,0 sobre 5 con 3 opiniones/);
});

// The owner's blurb used to be passed straight through: 249 characters submitted, ~160 shown, and
// the sentence cut mid-word at whatever the owner happened to be saying.
test("nothing generated runs past what a SERP shows", () => {
  const long = "¡Descubre Ferreras SMP, un servidor de Minecraft cercano al survival vanilla donde construir libremente granjas o lo que desees! Comparte momentos con una comunidad tranquila y cercana. ¡Únete a Discord y completa tu solicitud! <3";

  const description = buildServerMetaDescription({ ...base, ownerDescription: long });

  assert.ok(description.length <= SERVER_META_DESCRIPTION_MAX_LENGTH, `${description.length} chars: ${description}`);
});

test("a rating that does not exist is not claimed", () => {
  const description = buildServerMetaDescription({ ...base, average: null, reviewCount: 0 });

  assert.doesNotMatch(description, /sobre 5/);
  assert.doesNotMatch(description, /opinion/);
});

test("one review is counted in the singular", () => {
  assert.match(buildServerMetaDescription({ ...base, average: 4.5, reviewCount: 1 }), /4,5 sobre 5 con 1 opinión/);
});

test("a server with no modes or editions still describes itself", () => {
  const description = buildServerMetaDescription({ ...base, editions: [], gameModes: [], average: null, reviewCount: 0 });

  assert.match(description, /^Ferreras SMP: servidor de Minecraft\./);
});

test("descriptions stay unique per server", () => {
  const first = buildServerMetaDescription(base);
  const second = buildServerMetaDescription({ ...base, name: "Otro SMP", gameModes: ["Creativo"], average: 3, reviewCount: 8 });

  assert.notEqual(first, second);
});

test("truncation cuts at a word boundary and marks the cut", () => {
  assert.equal(truncateAtWord("corto", 20), "corto");
  const cut = truncateAtWord("una comunidad tranquila y cercana para construir", 24);

  assert.ok(cut.length <= 24, cut);
  assert.ok(cut.endsWith("…"), cut);
  assert.doesNotMatch(cut, /\s…$/);
});
