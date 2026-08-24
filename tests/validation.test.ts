import assert from "node:assert/strict";
import test from "node:test";

import { safeCallbackUrl } from "../src/lib/callback-url.ts";
import { databaseConstraint, databaseErrorCode } from "../src/lib/db-errors.ts";
import { isPublicAddress } from "../src/lib/minecraft/address.ts";
import { accessTypeLabel, accountModeLabel, authModeLabel } from "../src/lib/servers/access.ts";
import { NoVerifiedEndpointError } from "../src/lib/servers/service.ts";
import { NoBedrockEndpointError, NoJavaEndpointError } from "../src/lib/servers/verification.ts";
import {
  formatEndpoint,
  latencyClass,
  playersLabel,
  primaryEndpoint,
  statusClass,
  statusDot,
  statusLabel,
} from "../src/lib/servers/format.ts";
import {
  createServerInputSchema,
  defaultPortForEdition,
  normalizeCreateServerInput,
  normalizeHost,
  normalizeHttpUrl,
  slugifyServerName,
} from "../src/lib/servers/validation.ts";

test("rejects callback paths that browsers normalize to an external host", () => {
  assert.equal(safeCallbackUrl("/\t/evil.example", "/dashboard/servers"), "/dashboard/servers");
  assert.equal(safeCallbackUrl("/\r/evil.example", "/dashboard/servers"), "/dashboard/servers");
  assert.equal(safeCallbackUrl("/\n/evil.example", "/dashboard/servers"), "/dashboard/servers");
});

test("keeps callback navigation on a local absolute path", () => {
  assert.equal(safeCallbackUrl("/servers?sort=rating#results", "/"), "/servers?sort=rating#results");
  for (const value of [undefined, null, "", "servers", "//evil.example", "/\\evil.example"]) {
    assert.equal(safeCallbackUrl(value, "/dashboard/servers"), "/dashboard/servers");
  }
});

test("reads PostgreSQL metadata from direct and wrapped errors", () => {
  assert.equal(databaseErrorCode({ code: "23505" }), "23505");
  assert.equal(databaseErrorCode({ cause: { code: "23503" } }), "23503");
  assert.equal(databaseConstraint({ constraint: "servers_slug_unique" }), "servers_slug_unique");
  assert.equal(databaseConstraint({ cause: { constraint: "server_owner_unique" } }), "server_owner_unique");
  assert.equal(databaseErrorCode({ code: 23505, cause: { code: "23503" } }), "23503");
  assert.equal(databaseConstraint(new Error("database unavailable")), undefined);
});

test("accepts globally routable IPs and rejects local or provider metadata addresses", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
  for (const address of ["127.0.0.1", "10.0.0.1", "::1", "::ffff:127.0.0.1", "169.254.169.254", "168.63.129.16", "100.100.100.200", "not-an-ip"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("formats the preferred endpoint and partial player counts", () => {
  const server = {
    aggregateStatus: "online" as const,
    endpoints: [
      { edition: "bedrock" as const, playersCurrent: 12, playersMax: 50 },
      { edition: "java" as const, playersCurrent: 24, playersMax: null },
    ],
  };
  assert.equal(primaryEndpoint(server), server.endpoints[1]);
  assert.equal(playersLabel(server), "24 / \u2014");
  assert.equal(playersLabel({ aggregateStatus: "unknown", endpoints: [] }, "Sin datos"), "Sin datos");
  assert.equal(formatEndpoint({ edition: "java", host: "play.example.com", port: 25565 }), "play.example.com");
  assert.equal(formatEndpoint({ edition: "bedrock", host: "2001:db8::1", port: 19133 }), "[2001:db8::1]:19133");
});

test("maps health states and latency thresholds to their visible presentation", () => {
  assert.deepEqual(
    (["online", "offline", "unknown"] as const).map((status) => [statusLabel(status), statusClass(status), statusDot(status)]),
    [
      ["En l\u00ednea", "text-success", "bg-success"],
      ["Fuera de l\u00ednea", "text-destructive", "bg-destructive"],
      ["Estado desconocido", "text-muted-foreground", "bg-muted-foreground/40"],
    ],
  );
  assert.equal(latencyClass(null), "text-muted-foreground");
  assert.equal(latencyClass(60), "text-success");
  assert.equal(latencyClass(61), "text-warning");
});

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

test("server player labels prefer the canonical monitor value when available", () => {
  assert.equal(playersLabel({
    aggregateStatus: "online",
    endpoints: [{ edition: "java", playersCurrent: 12, playersMax: 50 }],
    monitor: { playersCurrent: 42, playersMax: 100 },
  }), "42 / 100");
  assert.equal(playersLabel({
    aggregateStatus: "offline",
    endpoints: [{ edition: "java", playersCurrent: 12, playersMax: 50 }],
    monitor: { playersCurrent: null, playersMax: null },
  }), "— / —");
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
  assert.equal(
    normalizeHttpUrl(" https://shop.example.com/store#buy ", "storeUrl"),
    "https://shop.example.com/store",
  );
  assert.equal(
    normalizeCreateServerInput({
      name: "A Minecraft Community",
      storeUrl: "https://shop.example.com/store",
      endpoints: [{ edition: "java", host: "play.example.com" }],
    }).storeUrl,
    "https://shop.example.com/store",
  );
  assert.throws(() => normalizeHttpUrl("javascript:alert(1)", "websiteUrl"));
  assert.throws(() => normalizeHttpUrl("shop.example.com", "storeUrl"));
});

test("normalizes omitted and blank store URLs to null", () => {
  const baseInput = {
    name: "A Minecraft Community",
    endpoints: [{ edition: "java" as const, host: "play.example.com" }],
  };

  assert.equal(normalizeCreateServerInput(baseInput).storeUrl, null);
  assert.equal(normalizeCreateServerInput({ ...baseInput, storeUrl: "   " }).storeUrl, null);
});

test("compacts repeated whitespace in server descriptions", () => {
  const input = normalizeCreateServerInput({
    name: "A Minecraft Community",
    description: "  Una comunidad\n\n\npara\t\t jugar.  ",
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });

  assert.equal(input.description, "Una comunidad para jugar.");
});

test("keeps the server description within the two-thousand-character limit", () => {
  assert.throws(() => normalizeCreateServerInput({
    name: "A Minecraft Community",
    description: "a".repeat(2_001),
    endpoints: [{ edition: "java", host: "play.example.com" }],
  }));
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

test("accepts a whitelist form and the mixed-account password profile", () => {
  const result = createServerInputSchema.safeParse({
    name: "A Minecraft Community",
    accessType: "whitelist",
    accessFormUrl: "https://forms.example.com/apply#questions",
    accountMode: "premium_and_non_premium",
    authMode: "password_non_premium",
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });

  assert.equal(result.success, true);
});

test("normalizes access details and strips a form URL fragment", () => {
  const input = normalizeCreateServerInput({
    name: "A Minecraft Community",
    accessType: "whitelist",
    accessFormUrl: " https://forms.example.com/apply#questions ",
    accountMode: "premium_and_non_premium",
    authMode: "password_non_premium",
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });

  assert.deepEqual(
    {
      accessType: input.accessType,
      accessFormUrl: input.accessFormUrl,
      accountMode: input.accountMode,
      authMode: input.authMode,
    },
    {
      accessType: "whitelist",
      accessFormUrl: "https://forms.example.com/apply",
      accountMode: "premium_and_non_premium",
      authMode: "password_non_premium",
    },
  );
});

test("defaults new servers to open premium-only direct access", () => {
  const input = normalizeCreateServerInput({
    name: "A Minecraft Community",
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });

  assert.deepEqual(
    {
      accessType: input.accessType,
      accessFormUrl: input.accessFormUrl,
      accountMode: input.accountMode,
      authMode: input.authMode,
    },
    { accessType: "open", accessFormUrl: null, accountMode: "premium_only", authMode: "direct" },
  );
});

test("keeps access labels understandable for public server views", () => {
  assert.equal(accessTypeLabel("open"), "Acceso abierto");
  assert.equal(accessTypeLabel("whitelist"), "Whitelist");
  assert.equal(accountModeLabel("premium_only"), "Solo premium");
  assert.equal(accountModeLabel("premium_and_non_premium"), "Premium y no-premium");
  assert.equal(authModeLabel({ accountMode: "premium_only", authMode: "direct" }), "Entrada directa");
  assert.equal(authModeLabel({ accountMode: "premium_and_non_premium", authMode: "password_non_premium" }), "Premium directo · no-premium con contraseña");
  assert.equal(authModeLabel({ accountMode: "premium_and_non_premium", authMode: "password_all" }), "Contraseña para todas las cuentas");
});

test("rejects a form link when the server is open", () => {
  const result = createServerInputSchema.safeParse({
    name: "A Minecraft Community",
    accessType: "open",
    accessFormUrl: "https://forms.example.com/apply",
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues.some((issue) => issue.message === "El formulario de acceso solo está disponible con whitelist."), true);
  }
});

test("rejects an authentication profile that cannot describe premium-only access", () => {
  const result = createServerInputSchema.safeParse({
    name: "A Minecraft Community",
    accountMode: "premium_only",
    authMode: "password_non_premium",
    endpoints: [{ edition: "java", host: "play.example.com" }],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues.some((issue) => issue.message === "La autenticación para no-premium solo aplica cuando se aceptan cuentas no-premium."), true);
  }
});

test("explains in Spanish that a published server needs a verified endpoint", () => {
  assert.equal(
    new NoVerifiedEndpointError().message,
    "Verifica al menos un endpoint de Minecraft antes de publicar este servidor.",
  );
});

test("uses one identity message when no verification address is available", () => {
  const expected = "Añade una dirección pública de Minecraft antes de verificar la identidad de este servidor.";

  assert.equal(new NoJavaEndpointError().message, expected);
  assert.equal(new NoBedrockEndpointError().message, expected);
});
