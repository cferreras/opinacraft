import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { SEARCH_SESSION_TTL_MS, issueSearchSession, verifySearchSession } from "@/lib/search/session";
import { verifyTurnstileToken } from "@/lib/search/turnstile";

const secret = "a".repeat(32);

test("a session lasts thirty minutes and identifies itself with an opaque id", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const session = issueSearchSession(secret, { now });

  assert.equal(session.expiresAt.getTime() - now.getTime(), SEARCH_SESSION_TTL_MS);
  assert.equal(SEARCH_SESSION_TTL_MS, 30 * 60 * 1000);
  assert.match(session.sid, /^[0-9a-f-]{36}$/, "an opaque id, not an account or an address");
  assert.equal(verifySearchSession(session.token, secret, { now }), session.sid);
});

test("a session is refused once it expires", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const session = issueSearchSession(secret, { now });

  const oneSecondBefore = new Date(now.getTime() + SEARCH_SESSION_TTL_MS - 1000);
  assert.equal(verifySearchSession(session.token, secret, { now: oneSecondBefore }), session.sid);

  const justAfter = new Date(now.getTime() + SEARCH_SESSION_TTL_MS + 1);
  assert.equal(verifySearchSession(session.token, secret, { now: justAfter }), null);
});

test("a tampered or foreign token proves nothing", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const { token } = issueSearchSession(secret, { now });
  const [body, signature] = token.split(".");

  assert.equal(verifySearchSession(token, "b".repeat(32), { now }), null, "signed with another secret");
  assert.equal(verifySearchSession(`${body}.${"x".repeat(signature.length)}`, secret, { now }), null, "forged signature");
  assert.equal(verifySearchSession(`${body}x.${signature}`, secret, { now }), null, "edited payload");
  assert.equal(verifySearchSession(signature, secret, { now }), null, "not a token at all");
  assert.equal(verifySearchSession(undefined, secret, { now }), null);
  assert.equal(verifySearchSession(token, "", { now }), null, "no secret configured means no sessions");
});

test("an expiry pushed into the future by hand does not survive the signature", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const { token } = issueSearchSession(secret, { now });
  const [body, signature] = token.split(".");

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sid: string; exp: number };
  const forged = Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + SEARCH_SESSION_TTL_MS * 100 }), "utf8").toString("base64url");

  assert.equal(verifySearchSession(`${forged}.${signature}`, secret, { now }), null);
});

test("the token carries no allowance, so it cannot be replayed to refill one", () => {
  const { token } = issueSearchSession(secret);
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;

  assert.deepEqual(Object.keys(payload).sort(), ["exp", "sid"]);
});

test("Turnstile accepts only a token Cloudflare confirms", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: String(init?.body) });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

  const result = await verifyTurnstileToken({ token: "a-token", secret: "a-secret", remoteIp: "203.0.113.7", fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  const sent = new URLSearchParams(requests[0].body);
  assert.equal(sent.get("secret"), "a-secret");
  assert.equal(sent.get("response"), "a-token");
  assert.equal(sent.get("remoteip"), "203.0.113.7");
});

test("every Turnstile failure is a plain no, never an exception", async () => {
  const unsuccessful = (async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 })) as unknown as typeof fetch;
  const serverError = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  const offline = (async () => { throw Object.assign(new Error("fetch failed"), { name: "TypeError" }); }) as unknown as typeof fetch;
  const garbage = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;

  assert.deepEqual(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: unsuccessful }), { ok: false, errorCodes: ["invalid-input-response"] });
  assert.deepEqual(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: serverError }), { ok: false, errorCodes: ["http-500"] });
  assert.equal((await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: offline })).ok, false);
  assert.equal((await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: garbage })).ok, false);
  // Nothing to verify is also a no, and it costs no request.
  assert.equal((await verifyTurnstileToken({ token: "", secret: "s" })).ok, false);
  assert.equal((await verifyTurnstileToken({ token: "t", secret: "" })).ok, false);
});

const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

test("the Jev key and the Turnstile secret exist only on the server", () => {
  const serverOnly = ["TYPESAFE_API_KEY", "TURNSTILE_SECRET_KEY", "AI_SEARCH_SESSION_SECRET"];
  // Where a secret may be named at all: the env schema that declares it, and the one module that
  // wires the pipeline up. Anything else is either a leak or a second source of truth.
  const allowed = new Set([
    path.normalize("src/env/server.ts"),
    path.normalize("src/lib/search/runtime.ts"),
  ]);

  for (const file of sourceFiles("src")) {
    const source = readFileSync(file, "utf8");
    const relative = path.relative(process.cwd(), file);
    for (const secret of serverOnly) {
      if (!source.includes(secret)) continue;
      assert.ok(allowed.has(path.normalize(relative)), `${relative} should not name ${secret}`);
    }
    if (!source.startsWith('"use client"')) continue;
    // A client component that imported these would pull the key into the browser bundle.
    for (const serverModule of ["@/env/server", "@/lib/search/runtime", "@/lib/search/jev", "@/lib/search/store"]) {
      assert.ok(!source.includes(`from "${serverModule}"`), `${relative} is a client component and must not import ${serverModule}`);
    }
  }

  // The site key is the only half of Turnstile the browser is allowed to know.
  assert.match(readProjectFile("src/env/client.ts"), /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(readProjectFile("src/env/client.ts"), /TURNSTILE_SECRET_KEY/);
});

test("the ceilings are enforced with the shared Postgres counter, not a local one", () => {
  const runtime = readProjectFile("src/lib/search/runtime.ts");

  // An in-process counter would reset on every cold start, which on serverless means no ceiling.
  assert.match(runtime, /import \{ consumeRateLimit \} from "@\/lib\/rate-limit";/);
  assert.match(runtime, /claimJevCall\(\{\s*limit: config\.dailyLimit,\s*consume: consumeRateLimit/);
  assert.match(runtime, /consumeRateLimit\(`ai-search:session:\$\{sessionId\}`, config\.sessionQuota, SEARCH_SESSION_TTL_MS\)/);
  // No session, no inference: the quota is keyed by a session id and there is nothing to key by.
  assert.match(runtime, /if \(!sessionId\) return false;/);
});

test("only the Jev path requires a session; the rest of the search is free", () => {
  const interpret = readProjectFile("src/lib/search/interpret.ts");

  // `allowInference` sits between the cache and the call, so the dictionary, the cache and the
  // keyword fallback are all reached without one.
  const gate = interpret.indexOf("allowInference &&");
  assert.ok(gate > interpret.indexOf("isFullyResolved(dictionary)"), "the dictionary answers before any gate");
  assert.ok(gate > interpret.indexOf("await cache.read(hash)"), "a cached answer needs no session");
  assert.ok(gate < interpret.indexOf("await ask(normalizedQuery)"), "the gate must come before the call");
});
