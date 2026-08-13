import assert from "node:assert/strict";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { AddressInfo, Server as NetServer } from "node:net";

import { flattenMotd, normalizeMotd, motdContainsCode } from "../src/lib/minecraft/motd.ts";
import { isPublicHost } from "../src/lib/servers/validation.ts";
import { pingBedrockServer } from "../src/lib/minecraft/bedrock-ping.ts";
import { createMinecraftPingOptions, pingJavaServer } from "../src/lib/minecraft/ping.ts";
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

test("Java ping reports the Minecraft server-list ping separately from delayed status processing", async () => {
  const protocolModule = await import("minecraft-protocol");
  const minecraftProtocol = protocolModule.default ?? protocolModule;
  const server = minecraftProtocol.createServer({
    host: "127.0.0.1",
    port: 0,
    "online-mode": false,
    version: "1.21.8",
    motd: "delayed status",
    beforePing: (response, _client, callback) => {
      setTimeout(() => callback?.(null, response), 100);
    },
  });
  server.on("connection", (client) => {
    let delayedPing = false;
    const write = client.write.bind(client);
    const end = client.end.bind(client);
    client.write = (name, params) => {
      if (name === "ping") {
        delayedPing = true;
        setTimeout(() => {
          delayedPing = false;
          write(name, params);
          end();
        }, 60);
        return;
      }
      write(name, params);
    };
    client.end = (reason) => {
      if (!delayedPing) end(reason);
    };
  });
  const socketServer = (server as unknown as { socketServer: NetServer }).socketServer;

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = socketServer.address();
    assert.ok(address && typeof address !== "string");

    const startedAt = process.hrtime.bigint();
    const result = await pingJavaServer({
      connectHost: "127.0.0.1",
      handshakeHost: "mc.example.com",
      port: address.port,
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    assert.deepEqual(result.description, { text: "delayed status" });
    assert.equal(result.players.online, 0);
    assert.equal(typeof result.latencyMs, "number");
    assert.equal(result.latencyMs, result.latency);
    assert.ok(result.latencyMs >= 40);
    assert.ok(elapsedMs >= 80);
    assert.ok(result.latencyMs < elapsedMs - 50);
  } finally {
    const clients = Object.values(server.clients);
    const clientsClosed = Promise.all(clients.map((client) => new Promise<void>((resolve) => {
      if (client.socket.destroyed) {
        const closeTimer = (client as unknown as { closeTimer?: ReturnType<typeof setTimeout> }).closeTimer;
        if (closeTimer) clearTimeout(closeTimer);
        resolve();
        return;
      }
      client.socket.once("close", resolve);
      client.socket.destroy();
      const closeTimer = (client as unknown as { closeTimer?: ReturnType<typeof setTimeout> }).closeTimer;
      if (closeTimer) clearTimeout(closeTimer);
    })));
    const serverClosed = new Promise<void>((resolve, reject) => {
      socketServer.once("close", resolve);
      socketServer.once("error", reject);
      socketServer.close();
    });
    await Promise.all([clientsClosed, serverClosed]);
  }
});

test("Bedrock ping reports the RakNet unconnected ping round-trip", async () => {
  const magic = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
  const socket = dgram.createSocket("udp4");
  socket.on("message", (request, remote) => {
    const payload = Buffer.from("MCPE;Delayed Bedrock;685;1.21.8;3;20;0;test", "utf8");
    const response = Buffer.alloc(35 + payload.length);
    response[0] = 0x1c;
    request.copy(response, 1, 1, 9);
    magic.copy(response, 17);
    response.writeUInt16BE(payload.length, 33);
    payload.copy(response, 35);
    setTimeout(() => socket.send(response, remote.port, remote.address), 60);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("listening", resolve);
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1");
  });

  try {
    const address = socket.address() as AddressInfo;
    const startedAt = process.hrtime.bigint();
    const result = await pingBedrockServer({
      connectHost: "127.0.0.1",
      handshakeHost: "bedrock.example.com",
      port: address.port,
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    assert.equal(result.description, "Delayed Bedrock");
    assert.deepEqual(result.players, { online: 3, max: 20 });
    assert.equal(result.version.name, "1.21.8");
    const latencyMs = result.latencyMs;
    assert.equal(typeof latencyMs, "number");
    if (typeof latencyMs !== "number") {
      throw new Error("Expected Bedrock latency to be measured");
    }
    assert.ok(latencyMs >= 40);
    assert.ok(latencyMs <= elapsedMs);
  } finally {
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
});
