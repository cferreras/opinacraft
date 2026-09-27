import assert from "node:assert/strict";
import { constants, createHmac, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import test from "node:test";

import {
  isValidVotifierSecret,
  parseVotifierPublicKey,
  sendVotifierVote,
  type VotifierVote,
} from "@/lib/votes/votifier";

const vote: VotifierVote = {
  serviceName: "OpinaCraft",
  username: "Notch",
  address: "203.0.113.7",
  timestamp: 1_790_000_000_000,
};

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

async function fakeServer(onConnection: (socket: Socket) => void) {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    onConnection(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    // The SSRF guard refuses loopback, so tests hand the library the address directly.
    resolve: async () => [{ connectHost: "127.0.0.1", port }],
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function collect(socket: Socket, bytes: number, onComplete: (data: Buffer) => void) {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length >= 4 && buffer.readUInt16BE(0) === 0x733a) {
      if (buffer.length >= 4 + buffer.readUInt16BE(2)) onComplete(buffer);
    } else if (buffer.length >= bytes) {
      onComplete(buffer);
    }
  });
}

test("v2 token vote carries magic, length, challenge and a valid signature", async () => {
  const token = "abc123def456ghi789jkl012mn";
  const challenge = "q1w2e3r4t5y6";
  let seen: Record<string, unknown> | undefined;
  const server = await fakeServer((socket) => {
    socket.write(`VOTIFIER 2 ${challenge}\n`);
    collect(socket, 4, (data) => {
      assert.equal(data.readUInt16BE(0), 0x733a);
      const length = data.readUInt16BE(2);
      assert.equal(data.length, 4 + length);
      const message = JSON.parse(data.subarray(4).toString("utf8")) as { payload: string; signature: string };
      const expected = createHmac("sha256", token).update(message.payload, "utf8").digest("base64");
      assert.equal(message.signature, expected);
      seen = JSON.parse(message.payload) as Record<string, unknown>;
      socket.end(`${JSON.stringify({ status: "ok" })}\r\n`);
    });
  });
  try {
    const result = await sendVotifierVote(
      { host: "vote.example.com", port: server.port, keyType: "token", secret: ` ${token}\n` },
      vote,
      { resolve: server.resolve },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(seen, { ...vote, challenge });
  } finally {
    await server.close();
  }
});

test("v2 error status is reported as a rejected key", async () => {
  const server = await fakeServer((socket) => {
    socket.write("VOTIFIER 2 challenge\n");
    collect(socket, 4, () => {
      socket.end(`${JSON.stringify({ status: "error", cause: "CorruptedFrameException", error: "Signature is not valid" })}\r\n`);
    });
  });
  try {
    const result = await sendVotifierVote(
      { host: "vote.example.com", port: server.port, keyType: "token", secret: "wrongtoken" },
      vote,
      { resolve: server.resolve },
    );
    assert.deepEqual({ ok: result.ok, code: !result.ok && result.code }, { ok: false, code: "rejected" });
  } finally {
    await server.close();
  }
});

test("v1 RSA vote decrypts with the matching private key", async () => {
  let plaintext: string | undefined;
  const server = await fakeServer((socket) => {
    socket.write("VOTIFIER 1.9\n");
    collect(socket, 256, (data) => {
      assert.equal(data.length, 256);
      plaintext = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, data).toString("utf8");
      socket.end();
    });
  });
  try {
    const result = await sendVotifierVote(
      { host: "vote.example.com", port: server.port, keyType: "rsa", secret: publicKeyBase64 },
      vote,
      { resolve: server.resolve },
    );
    assert.equal(result.ok, true);
    assert.equal(plaintext, `VOTE\nOpinaCraft\nNotch\n203.0.113.7\n${vote.timestamp}\n`);
  } finally {
    await server.close();
  }
});

test("a silent server times out", async () => {
  const server = await fakeServer(() => {});
  try {
    const result = await sendVotifierVote(
      { host: "vote.example.com", port: server.port, keyType: "token", secret: "token" },
      vote,
      { resolve: server.resolve, timeoutMs: 200 },
    );
    assert.deepEqual({ ok: result.ok, code: !result.ok && result.code }, { ok: false, code: "timeout" });
  } finally {
    await server.close();
  }
});

test("a greeting that is not Votifier is a protocol error", async () => {
  const server = await fakeServer((socket) => socket.write("SSH-2.0-OpenSSH_9.6\r\n"));
  try {
    const result = await sendVotifierVote(
      { host: "vote.example.com", port: server.port, keyType: "token", secret: "token" },
      vote,
      { resolve: server.resolve },
    );
    assert.deepEqual({ ok: result.ok, code: !result.ok && result.code }, { ok: false, code: "protocol" });
  } finally {
    await server.close();
  }
});

test("invalid keys fail before any connection is made", async () => {
  let resolved = false;
  const resolve = async () => {
    resolved = true;
    return [];
  };
  for (const [keyType, secret] of [["rsa", "not a key"], ["rsa", "QUJD"], ["token", ""], ["token", "has space"]] as const) {
    const result = await sendVotifierVote({ host: "vote.example.com", port: 8192, keyType, secret }, vote, { resolve });
    assert.deepEqual({ ok: result.ok, code: !result.ok && result.code }, { ok: false, code: "invalid-key" });
  }
  assert.equal(resolved, false);
});

test("the real guard blocks private Votifier hosts", async () => {
  const result = await sendVotifierVote(
    { host: "127.0.0.1", port: 8192, keyType: "token", secret: "token" },
    vote,
  );
  assert.deepEqual({ ok: result.ok, code: !result.ok && result.code }, { ok: false, code: "blocked" });
});

test("public keys are accepted as base64 DER or PEM", () => {
  assert.equal(parseVotifierPublicKey(publicKeyBase64).asymmetricKeyDetails?.modulusLength, 2048);
  const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
  assert.equal(isValidVotifierSecret("rsa", pem), true);
  assert.equal(isValidVotifierSecret("rsa", publicKeyBase64.replace(/(.{64})/g, "$1\n")), true);
  const small = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey;
  assert.equal(isValidVotifierSecret("rsa", small.export({ format: "pem", type: "spki" }).toString()), false);
});

test("Votifier secrets round-trip and reject tampering", async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/opinacraft";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.VOTIFIER_SECRET ??= "votifier-test-secret-at-least-32-characters";
  const { decryptVotifierSecret, encryptVotifierSecret, votifierSecretConfigured } = await import(
    "@/lib/votes/votifier-secret"
  );
  assert.equal(votifierSecretConfigured(), true);
  const payload = encryptVotifierSecret(publicKeyBase64);
  assert.equal(payload[0], 1);
  assert.equal(decryptVotifierSecret(payload), publicKeyBase64);
  assert.notDeepEqual(encryptVotifierSecret(publicKeyBase64), payload);

  const tampered = Buffer.from(payload);
  tampered[tampered.length - 1] ^= 0x01;
  assert.throws(() => decryptVotifierSecret(tampered));
  assert.throws(() => decryptVotifierSecret(Buffer.from([2, ...payload.subarray(1)])));
});

test("local Votifier hosts are only allowed outside production, and only when asked for", async () => {
  const { localVotifierHostsAllowed } = await import("@/lib/votes/local-votifier");
  assert.equal(localVotifierHostsAllowed({ NODE_ENV: "development", VOTIFIER_ALLOW_PRIVATE_HOSTS: "true" }, "development"), true);
  assert.equal(localVotifierHostsAllowed({ NODE_ENV: "development", VOTIFIER_ALLOW_PRIVATE_HOSTS: "false" }, "development"), false);
  assert.equal(localVotifierHostsAllowed({ NODE_ENV: "production", VOTIFIER_ALLOW_PRIVATE_HOSTS: "true" }, "production"), false);
  // A deploy whose parsed env disagrees with the process still keeps the guard.
  assert.equal(localVotifierHostsAllowed({ NODE_ENV: "development", VOTIFIER_ALLOW_PRIVATE_HOSTS: "true" }, "production"), false);
});
