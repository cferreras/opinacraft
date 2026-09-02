import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createTcpServer } from "node:net";
import test from "node:test";

import { canRole } from "../src/lib/servers/permissions.ts";
import { fetchMonitorHistory, isMonitorServerId } from "../src/lib/servers/monitor-api-client.ts";
import { MinecraftResponseError, pingJavaServer } from "../src/lib/minecraft/ping.ts";
import { createMonitorApiNodeListener, MAX_REQUEST_BODY_BYTES } from "../src/workers/monitor-api-http.ts";

function writeVarInt(value: number) {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

function statusResponsePacket(json: string) {
  const payload = Buffer.concat([
    writeVarInt(0),
    writeVarInt(Buffer.byteLength(json)),
    Buffer.from(json, "utf8"),
  ]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

/** A Java endpoint that answers any status request with the given raw payload. */
async function withMaliciousJavaEndpoint(json: string, run: (port: number) => Promise<void>) {
  const server = createTcpServer((socket) => {
    socket.on("error", () => undefined);
    socket.once("data", () => {
      setTimeout(() => socket.write(statusResponsePacket(json)), 20);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a malformed Java status response rejects the probe instead of killing the process", async () => {
  const uncaught: unknown[] = [];
  const listener = (error: unknown) => uncaught.push(error);
  process.on("uncaughtException", listener);
  try {
    await withMaliciousJavaEndpoint('{"description":', async (port) => {
      await assert.rejects(
        () => pingJavaServer({ connectHost: "127.0.0.1", handshakeHost: "mc.example.com", port }),
        MinecraftResponseError,
      );
    });
    // The next probe must still run in the same process.
    await withMaliciousJavaEndpoint("null", async (port) => {
      await assert.rejects(
        () => pingJavaServer({ connectHost: "127.0.0.1", handshakeHost: "mc.example.com", port }),
        MinecraftResponseError,
      );
    });
  } finally {
    process.off("uncaughtException", listener);
  }
  assert.deepEqual(uncaught, []);
});

async function withMonitorApiListener(
  secret: string,
  handler: (request: Request) => Promise<Response>,
  run: (baseUrl: string) => Promise<void>,
  timeoutMs?: number,
) {
  const server = createHttpServer(createMonitorApiNodeListener({ secret, handler, timeoutMs }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Sends a request with a body even when fetch() would strip it. */
function rawRequest(baseUrl: string, path: string, method: string, body: string) {
  return new Promise<number>((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          authorization: "Bearer monitor-secret",
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

test("the Monitor API refuses unauthenticated requests without reading their body", async () => {
  let handled = 0;
  let bodyBytesRead = 0;
  const oversized = "a".repeat(MAX_REQUEST_BODY_BYTES + 1_024);

  await withMonitorApiListener("monitor-secret", async (request) => {
    handled += 1;
    bodyBytesRead += (await request.arrayBuffer()).byteLength;
    return Response.json({ ok: true });
  }, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/v1/status/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversized,
    });
    assert.equal(unauthorized.status, 401);

    const tooLarge = await fetch(`${baseUrl}/v1/status/batch`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer monitor-secret" },
      body: oversized,
    });
    assert.equal(tooLarge.status, 413);

    // fetch() drops a body on GET, so the raw client is used to prove the
    // adapter refuses one instead of buffering and discarding it.
    const getWithBody = await rawRequest(baseUrl, "/v1/targets", "GET", "unnecessary");
    assert.equal(getWithBody, 400);

    const accepted = await fetch(`${baseUrl}/v1/status/batch`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer monitor-secret" },
      body: JSON.stringify({ serverIds: [] }),
    });
    assert.equal(accepted.status, 200);
  });

  // Only the authenticated, in-bounds request ever reached the API handler.
  assert.equal(handled, 1);
  assert.equal(bodyBytesRead, JSON.stringify({ serverIds: [] }).length);
});

test("a slow client cannot hold a Monitor API request open past the deadline", async () => {
  let handled = 0;

  await withMonitorApiListener("monitor-secret", async (request) => {
    handled += 1;
    await request.arrayBuffer();
    return Response.json({ ok: true });
  }, async (baseUrl) => {
    const url = new URL("/v1/status/batch", baseUrl);
    let dribble: ReturnType<typeof setInterval> | undefined;
    let guard: ReturnType<typeof setTimeout> | undefined;
    const status = await new Promise<number>((resolve) => {
      const outgoing = httpRequest({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          authorization: "Bearer monitor-secret",
          "content-type": "application/json",
          // Chunked, so the adapter cannot know when the body ends.
          "transfer-encoding": "chunked",
        },
      }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      });
      outgoing.once("error", () => resolve(0));
      // A tiny chunk well inside the byte cap, sent far more often than the
      // deadline and never stopping: an inactivity timeout alone never fires,
      // so only an absolute deadline can end this request.
      dribble = setInterval(() => outgoing.write("."), 40);
      guard = setTimeout(() => resolve(0), 3_000);
    });
    if (dribble) clearInterval(dribble);
    if (guard) clearTimeout(guard);
    assert.equal(status, 408);
  }, 300);

  // The request was cut off before the handler could see a complete body.
  assert.equal(handled, 0);
});

test("only canonical UUIDs reach the authenticated Monitor history endpoint", async () => {
  assert.equal(isMonitorServerId("00000000-0000-0000-0000-000000000001"), true);
  assert.equal(isMonitorServerId("../targets"), false);
  assert.equal(isMonitorServerId("00000000-0000-0000-0000-000000000001/../../v1/targets"), false);
  assert.equal(isMonitorServerId("00000000-0000-0000-0000-000000000001?x=1"), false);

  const previousUrl = process.env.MONITOR_API_URL;
  const previousSecret = process.env.MONITOR_API_SECRET;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  process.env.MONITOR_API_URL = "https://monitor-api.example.test";
  process.env.MONITOR_API_SECRET = "test-secret";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return Response.json({ period: "24h", series: [] });
  }) as typeof fetch;

  try {
    await assert.rejects(() => fetchMonitorHistory("../v1/targets", "24h"), /Invalid monitor server ID/);
    await fetchMonitorHistory("00000000-0000-0000-0000-000000000001", "24h");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.MONITOR_API_URL;
    else process.env.MONITOR_API_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.MONITOR_API_SECRET;
    else process.env.MONITOR_API_SECRET = previousSecret;
  }

  assert.deepEqual(requestedUrls, [
    "https://monitor-api.example.test/v1/servers/00000000-0000-0000-0000-000000000001/history?period=24h",
  ]);
});

test("nothing can give an account back its share of the shared media budget", async () => {
  // The shared advancedOperations counter is charged on reservation and never
  // refunded, so the per-account slice must not be refundable either: an
  // account that failed its uploads on purpose would otherwise drain the shared
  // monthly budget while staying under its own cap forever.
  const quota = await import("../src/lib/media/quota.ts");
  assert.equal("releaseAccountMediaOperation" in quota, false);

  const sources = [
    "src/lib/media/quota.ts",
    "src/app/api/account/avatar/route.ts",
    "src/app/api/servers/[serverId]/media/route.ts",
  ];
  for (const path of sources) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /advancedOperations[^\n]*-\s*1/, `${path} decrements the account operation counter`);
    assert.doesNotMatch(source, /windowOperations[^\n]*-\s*1/, `${path} decrements the account window counter`);
  }
});

test("only the owner holds the destructive server:delete capability", () => {
  assert.equal(canRole("server:delete", "owner"), true);
  assert.equal(canRole("server:delete", "admin"), false);
  assert.equal(canRole("server:delete", "editor"), false);
  // Admins keep the editing capability that deletion used to be bundled with.
  assert.equal(canRole("identity:edit", "admin"), true);
});


