import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { flattenMotd, normalizeMotd, motdContainsCode } from "../src/lib/minecraft/motd.ts";
import { isPublicHost } from "../src/lib/servers/validation.ts";
import { createMinecraftPingOptions } from "../src/lib/minecraft/ping.ts";
import { BlockedMinecraftTargetError, resolveMinecraftTarget } from "../src/lib/minecraft/network.ts";

test("verification codes have the documented format and alphabet", async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/opinacraft";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  const { generateVerificationCode } = await import("../src/lib/servers/verification-crypto.ts");
  const code = generateVerificationCode();
  assert.match(code, /^OPINACRAFT-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.ok(!/[01ILO]/.test(code.slice("OPINACRAFT-".length)));
});

test("MOTD components are flattened and formatting is removed", () => {
  const code = "OPINACRAFT-7K4P2-M9QXR";
  const motd = {
    text: "§aOPINACRAFT-7K4P2-",
    extra: [{ text: "§bM9QXR" }],
  };

  assert.equal(flattenMotd(motd), "§aOPINACRAFT-7K4P2-§bM9QXR");
  assert.equal(normalizeMotd(motd), code);
  assert.equal(motdContainsCode(motd, code), true);
});

test("stored endpoint validation rejects local and single-label hosts", () => {
  assert.equal(isPublicHost("127.0.0.1"), false);
  assert.equal(isPublicHost("localhost"), false);
  assert.equal(isPublicHost("play.local"), false);
  assert.equal(isPublicHost("mc.example.com"), true);
});

test("SSRF target validation rejects private, mapped and low-port addresses", async () => {
  for (const [host, port] of [["127.0.0.1", 25565], ["::1", 25565], ["::ffff:127.0.0.1", 25565], ["203.0.113.10", 25565], ["8.8.8.8", 443]] as const) {
    await assert.rejects(resolveMinecraftTarget(host, port), BlockedMinecraftTargetError);
  }
});

test("SSRF target validation accepts a public literal address", async () => {
  assert.deepEqual(await resolveMinecraftTarget("147.185.221.231", 25565), {
    handshakeHost: "147.185.221.231",
    connectHost: "147.185.221.231",
    port: 25565,
  });
});

test("Minecraft connector uses the fixed IP and original handshake host", () => {
  let connectionTarget: unknown;
  const socket = Object.assign(new EventEmitter(), {
    connect: (target: unknown) => {
      connectionTarget = target;
    },
  });
  let attachedSocket: unknown;
  const emitted: string[] = [];
  const options = createMinecraftPingOptions(
    { connectHost: "203.0.113.20", handshakeHost: "mc.example.com", port: 25565 },
    socket as never,
  );

  options.connect({
    setSocket: (value) => {
      attachedSocket = value;
      socket.once("connect", () => emitted.push("connect"));
    },
  });

  assert.equal(options.host, "mc.example.com");
  assert.equal(options.port, 25565);
  assert.equal(attachedSocket, socket);
  assert.deepEqual(connectionTarget, {
    host: "203.0.113.20",
    port: 25565,
  });
  assert.deepEqual(emitted, []);
  socket.emit("connect");
  assert.deepEqual(emitted, ["connect"]);
});
