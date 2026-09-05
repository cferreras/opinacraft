import assert from "node:assert/strict";
import test from "node:test";

import {
  MINECRAFT_PORT_MAX,
  MINECRAFT_PORT_MIN,
  parseEnabledPort,
} from "../src/lib/servers/endpoint-fields.ts";
import { serverValidationField } from "../src/lib/servers/form-validation.ts";
import { formatServerDateTime } from "../src/lib/servers/display.ts";
import { numberEnv } from "../src/workers/monitor-worker-config.ts";
import {
  probeCanonicalEndpoint,
  type MonitorProbeDependencies,
} from "../src/workers/monitor-worker-probe.ts";
import { MinecraftOfflineError } from "../src/lib/minecraft/ping.ts";

test("enabled editions reject a blank port while disabled editions remain omitted", () => {
  assert.equal(parseEnabledPort("", false), undefined);
  assert.equal(Number.isNaN(parseEnabledPort("", true)), true);
  assert.equal(parseEnabledPort("25565", true), 25_565);
  assert.equal(parseEnabledPort("19132", true), 19_132);
  assert.equal(MINECRAFT_PORT_MIN, 1_024);
  assert.equal(MINECRAFT_PORT_MAX, 65_535);
});

test("server validation issues for shared host or edition ports target the endpoint field", () => {
  assert.equal(serverValidationField(["host"]), "endpoints");
  assert.equal(serverValidationField(["javaPort"]), "endpoints");
  assert.equal(serverValidationField(["bedrockPort"]), "endpoints");
  assert.equal(serverValidationField(["name"]), "name");
  assert.equal(serverValidationField(["unexpected"]), null);
});

test("server date-time labels include the observation time and preserve the empty fallback", () => {
  assert.equal(formatServerDateTime(null), "Aún no comprobado");
  const label = formatServerDateTime(new Date("2026-08-14T12:34:00.000Z"));
  assert.match(label, /14/);
  assert.match(label, /\d{1,2}:34/);
});

test("blank worker environment values use their fallback before numeric validation", () => {
  const env = { MONITOR_BATCH_SIZE: "   " };
  assert.equal(numberEnv("MONITOR_BATCH_SIZE", 50, 1, env), 50);
  assert.equal(numberEnv("MONITOR_BATCH_SIZE", 50, 1, { MONITOR_BATCH_SIZE: "25" }), 25);
  assert.throws(() => numberEnv("MONITOR_BATCH_SIZE", 50, 1, { MONITOR_BATCH_SIZE: "0" }), /integer >= 1/);
});

function probeDependencies(overrides: Partial<MonitorProbeDependencies> = {}): MonitorProbeDependencies {
  return {
    resolveJavaTargets: async () => [{ handshakeHost: "play.example.com", connectHost: "203.0.113.10", port: 25565 }],
    resolveBedrockTargets: async () => [{ handshakeHost: "play.example.com", connectHost: "203.0.113.10", port: 19132 }],
    pingJavaServer: async () => ({ description: "Server", version: { name: "Java", protocol: 1 }, players: { online: 4, max: 100 }, latency: 20, latencyMs: 20 }),
    pingBedrockServer: async () => ({ description: "Server", version: { name: "Bedrock", protocol: 1 }, players: { online: 4, max: 100 }, latencyMs: 20 }),
    ...overrides,
  };
}

test("monitor probes retry the next SRV target after an offline candidate", async () => {
  const calls: string[] = [];
  const result = await probeCanonicalEndpoint(
    { edition: "java", verificationStatus: "verified", host: "play.example.com", port: 25_565 },
    probeDependencies({
      resolveJavaTargets: async () => [
        { handshakeHost: "play.example.com", connectHost: "203.0.113.10", port: 25565 },
        { handshakeHost: "play.example.com", connectHost: "203.0.113.11", port: 25565 },
      ],
      pingJavaServer: async (target) => {
        calls.push(target.connectHost);
        if (target.connectHost.endsWith(".10")) throw new MinecraftOfflineError();
        return { description: "Server", version: { name: "Java", protocol: 1 }, players: { online: 4, max: 100 }, latency: 20, latencyMs: 20 };
      },
    }),
  );

  assert.equal(result.status, "online");
  assert.deepEqual(calls, ["203.0.113.10", "203.0.113.11"]);
});

test("monitor probe deadline maps a cancelled resolution to a timeout observation", async () => {
  const result = await probeCanonicalEndpoint(
    { edition: "java", verificationStatus: "verified", host: "play.example.com", port: 25_565 },
    probeDependencies({
      resolveJavaTargets: async () => new Promise(() => undefined),
    }),
    20,
  );

  assert.deepEqual(result, {
    status: "offline",
    failureCode: "timeout",
    playersCurrent: null,
    playersMax: null,
    version: null,
    latencyMs: null,
  });
});
