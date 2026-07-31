import assert from "node:assert/strict";
import test from "node:test";

import {
  createServerInputSchema,
  defaultPortForEdition,
  normalizeCreateServerInput,
  normalizeHost,
  normalizeHttpUrl,
  slugifyServerName,
} from "../src/lib/servers/validation.ts";

test("normalizes domain hosts and removes the trailing dot", () => {
  assert.equal(normalizeHost(" PLAY.Example.COM. "), "play.example.com");
});

test("normalizes expanded IPv6 hosts", () => {
  assert.equal(
    normalizeHost("[2001:0db8:0:0:0:0:0:1]"),
    "2001:db8::1",
  );
});

test("uses the edition-specific default ports", () => {
  assert.equal(defaultPortForEdition("java"), 25565);
  assert.equal(defaultPortForEdition("bedrock"), 19132);

  const input = normalizeCreateServerInput({
    name: "A Minecraft Community",
    endpoints: [
      { edition: "java", host: "PLAY.EXAMPLE.COM" },
      { edition: "bedrock", host: "play.example.com" },
    ],
  });

  assert.deepEqual(input.endpoints, [
    { edition: "java", host: "play.example.com", port: 25565 },
    { edition: "bedrock", host: "play.example.com", port: 19132 },
  ]);
});

test("rejects hosts containing a protocol", () => {
  assert.throws(() => normalizeHost("https://play.example.com"));
});

test("rejects duplicate editions in a single server input", () => {
  const result = createServerInputSchema.safeParse({
    name: "A Minecraft Community",
    endpoints: [
      { edition: "java", host: "java.example.com" },
      { edition: "java", host: "java-2.example.com" },
    ],
  });

  assert.equal(result.success, false);
});

test("creates an ASCII slug and validates external URLs", () => {
  assert.equal(slugifyServerName("Árbol & Minas"), "arbol-minas");
  assert.equal(
    normalizeHttpUrl("https://discord.gg/example#invite", "discordUrl"),
    "https://discord.gg/example",
  );
  assert.throws(() => normalizeHttpUrl("javascript:alert(1)", "websiteUrl"));
});

test("trims server tags and enforces the eight-tag limit", () => {
  const input = normalizeCreateServerInput({
    name: "A Minecraft Community",
    tags: [" Survival ", "survival", "español"],
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });
  assert.deepEqual(input.tags, ["Survival", "survival", "español"]);
  assert.equal(createServerInputSchema.safeParse({ name: "A Minecraft Community", tags: Array.from({ length: 9 }, () => "tag"), endpoints: [{ edition: "java", host: "play.example.com" }] }).success, false);
});
