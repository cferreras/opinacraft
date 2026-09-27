import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

// The module also holds the storage queries; the pool is created lazily and never connects here.
process.env.DATABASE_URL ??= "postgresql://localhost/opinacraft";

const {
  deriveVotifierStatus,
  parseVotifierForm,
  parseVotifierHost,
  parseVotifierKeyType,
  parseVotifierPort,
  testsStoredSettings,
  VOTIFIER_DEFAULT_PORT,
  votifierRailLabels,
  votifierStatusLabels,
} = await import("../src/lib/votes/votifier-settings.ts");

const publicKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "der", type: "spki" }).toString("base64");

test("votifier host accepts public domains and IPs, normalised", () => {
  assert.deepEqual(parseVotifierHost("  Play.Example.com. "), { ok: true, value: "play.example.com" });
  assert.deepEqual(parseVotifierHost("51.68.20.10"), { ok: true, value: "51.68.20.10" });
});

test("votifier host refuses schemes, paths, ports, private targets and oversize names", () => {
  for (const value of ["", "   ", "https://play.example.com", "play.example.com/vote", "play.example.com:8192", "localhost", "127.0.0.1", "10.0.0.5", "server.local", "203.0.113.7", `${"a".repeat(250)}.com`, 42]) {
    const result = parseVotifierHost(value);
    assert.equal(result.ok, false, `expected ${String(value)} to be refused`);
  }
  const scheme = parseVotifierHost("https://play.example.com");
  assert.ok(!scheme.ok && scheme.error.includes("http"));
});

test("votifier port defaults to 8192 and stays inside 1024–65535", () => {
  assert.deepEqual(parseVotifierPort(""), { ok: true, value: VOTIFIER_DEFAULT_PORT });
  assert.deepEqual(parseVotifierPort(" 8192 "), { ok: true, value: 8192 });
  assert.deepEqual(parseVotifierPort("1024"), { ok: true, value: 1024 });
  assert.deepEqual(parseVotifierPort("65535"), { ok: true, value: 65535 });
  for (const value of ["1023", "65536", "80", "8192.5", "-1", "abc", "1e4"]) {
    assert.equal(parseVotifierPort(value).ok, false, `expected ${value} to be refused`);
  }
});

test("votifier key type only takes token or rsa", () => {
  assert.deepEqual(parseVotifierKeyType("token"), { ok: true, value: "token" });
  assert.deepEqual(parseVotifierKeyType("rsa"), { ok: true, value: "rsa" });
  assert.equal(parseVotifierKeyType("RSA").ok, false);
  assert.equal(parseVotifierKeyType(undefined).ok, false);
});

test("the form requires a secret on first save and validates it", () => {
  const missing = parseVotifierForm({ host: "play.example.com", port: "8192", keyType: "token", secret: "" }, null);
  assert.ok(!missing.ok && missing.fieldErrors.secret);

  const spaced = parseVotifierForm({ host: "play.example.com", port: "8192", keyType: "token", secret: "abc def" }, null);
  assert.ok(!spaced.ok && spaced.fieldErrors.secret);

  const badKey = parseVotifierForm({ host: "play.example.com", port: "8192", keyType: "rsa", secret: "not-a-key" }, null);
  assert.ok(!badKey.ok && badKey.fieldErrors.secret);

  const token = parseVotifierForm({ host: "play.example.com", port: "8192", keyType: "token", secret: "  s3cr3tT0ken  " }, null);
  assert.deepEqual(token, { ok: true, value: { host: "play.example.com", port: 8192, keyType: "token", secret: "s3cr3tT0ken" } });

  const rsa = parseVotifierForm({ host: "play.example.com", port: "", keyType: "rsa", secret: publicKey }, null);
  assert.ok(rsa.ok && rsa.value.keyType === "rsa" && rsa.value.port === VOTIFIER_DEFAULT_PORT);
});

test("an empty secret keeps the stored one only for the same key type", () => {
  const keep = parseVotifierForm({ host: "play.example.com", port: "8193", keyType: "token", secret: "" }, { keyType: "token" });
  assert.deepEqual(keep, { ok: true, value: { host: "play.example.com", port: 8193, keyType: "token", secret: null } });

  const switched = parseVotifierForm({ host: "play.example.com", port: "8192", keyType: "rsa", secret: "" }, { keyType: "token" });
  assert.ok(!switched.ok && switched.fieldErrors.secret);
});

test("the form reports every field error at once", () => {
  const result = parseVotifierForm({ host: "http://x", port: "80", keyType: "other", secret: "" }, null);
  assert.ok(!result.ok);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["host", "keyType", "port"]);
});

test("status: not configured, untested, then whichever signal is newest", () => {
  const earlier = new Date("2026-09-27T10:00:00Z");
  const later = new Date("2026-09-27T11:00:00Z");
  assert.equal(deriveVotifierStatus(null), "not_configured");
  assert.equal(deriveVotifierStatus(null, { at: later, ok: true }), "not_configured");
  assert.equal(deriveVotifierStatus({ lastTestAt: null, lastTestOk: null }), "untested");
  assert.equal(deriveVotifierStatus({ lastTestAt: earlier, lastTestOk: true }), "connected");
  assert.equal(deriveVotifierStatus({ lastTestAt: earlier, lastTestOk: false }), "failing");
  assert.equal(deriveVotifierStatus({ lastTestAt: earlier, lastTestOk: false }, { at: later, ok: true }), "connected");
  assert.equal(deriveVotifierStatus({ lastTestAt: later, lastTestOk: true }, { at: earlier, ok: false }), "connected");
  assert.equal(deriveVotifierStatus({ lastTestAt: earlier, lastTestOk: true }, { at: later, ok: false }), "failing");
  assert.equal(deriveVotifierStatus({ lastTestAt: null, lastTestOk: null }, { at: later, ok: true }), "connected");
});

test("status labels match the panel pill and the sidebar wording", () => {
  assert.deepEqual(votifierStatusLabels, { connected: "Conectado", failing: "Sin conexión", untested: "Sin probar", not_configured: "Sin configurar" });
  assert.equal(votifierRailLabels.failing, "Con errores");
  assert.equal(votifierRailLabels.connected, "Conectado");
  assert.equal(votifierRailLabels.not_configured, "Sin configurar");
});

test("a test only counts for the stored settings when it used exactly them", () => {
  const stored = { host: "play.example.com", port: 8192, keyType: "token" as const, secret: "abc" };
  assert.equal(testsStoredSettings({ host: "play.example.com", port: 8192, keyType: "token", secret: null }, stored), true);
  assert.equal(testsStoredSettings({ host: "play.example.com", port: 8192, keyType: "token", secret: "abc" }, stored), true);
  assert.equal(testsStoredSettings({ host: "play.example.com", port: 8192, keyType: "token", secret: "xyz" }, stored), false);
  assert.equal(testsStoredSettings({ host: "other.example.com", port: 8192, keyType: "token", secret: null }, stored), false);
  assert.equal(testsStoredSettings({ host: "play.example.com", port: 8193, keyType: "token", secret: null }, stored), false);
  assert.equal(testsStoredSettings({ host: "play.example.com", port: 8192, keyType: "token", secret: null }, null), false);
});
