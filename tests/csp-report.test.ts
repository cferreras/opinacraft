import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { POST } from "@/app/api/csp-report/route";
import { normalizeCspReports } from "@/lib/security/csp-report";

function readProjectFile(filePath: string) {
  return readFileSync(path.resolve(filePath), "utf8");
}

// The old `report-uri` wire format, which is still the only one Safari and Firefox send.
test("a report-uri envelope is read", () => {
  const violations = normalizeCspReports({
    "csp-report": {
      "document-uri": "https://www.opinacraft.com/servers/mi-servidor",
      "violated-directive": "script-src",
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://analytics.example.com/tag.js",
      "original-policy": "default-src 'self'; script-src 'self'",
      "script-sample": "",
    },
  });
  assert.deepEqual(violations, [
    {
      directive: "script-src-elem",
      blockedUrl: "https://analytics.example.com/tag.js",
      documentUrl: "https://www.opinacraft.com/servers/mi-servidor",
      sample: "",
      disposition: "report",
    },
  ]);
});

// Chrome sends this one instead, batched, with different field names and other report types mixed in.
test("a report-to batch is read and non-CSP entries are dropped", () => {
  const violations = normalizeCspReports([
    {
      type: "csp-violation",
      url: "https://www.opinacraft.com/",
      body: {
        documentURL: "https://www.opinacraft.com/",
        effectiveDirective: "img-src",
        blockedURL: "http://cdn.example.com/logo.png",
        disposition: "report",
      },
    },
    { type: "deprecation", body: { id: "AnEvent" } },
    {
      type: "csp-violation",
      body: { effectiveDirective: "style-src-elem", blockedURL: "inline", disposition: "enforce" },
    },
  ]);
  assert.equal(violations.length, 2);
  assert.equal(violations[0]?.directive, "img-src");
  assert.equal(violations[0]?.blockedUrl, "http://cdn.example.com/logo.png");
  assert.equal(violations[1]?.directive, "style-src-elem");
  assert.equal(violations[1]?.disposition, "enforce");
});

test("a bare body with no envelope is still read", () => {
  const violations = normalizeCspReports({ "effective-directive": "font-src", "blocked-uri": "data" });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.directive, "font-src");
});

// The endpoint takes anything anyone posts at it, so everything that is not a violation is nothing.
test("anything unrecognisable yields no violations", () => {
  assert.deepEqual(normalizeCspReports(null), []);
  assert.deepEqual(normalizeCspReports("csp-report"), []);
  assert.deepEqual(normalizeCspReports(42), []);
  assert.deepEqual(normalizeCspReports({}), []);
  assert.deepEqual(normalizeCspReports([]), []);
  assert.deepEqual(normalizeCspReports({ "csp-report": { "blocked-uri": "x" } }), []);
  assert.deepEqual(normalizeCspReports([{ type: "csp-violation" }]), []);
});

// A report is untrusted text bound for a log line: one violation has to stay one line.
test("fields are stripped of control characters and clipped", () => {
  const violations = normalizeCspReports({
    "csp-report": {
      "effective-directive": "script-src",
      "script-sample": `alert(1)\n\rcsp-violation {"directive":"forged"}`,
      "blocked-uri": `https://example.com/${"a".repeat(400)}`,
    },
  });
  const violation = violations[0];
  assert.ok(violation);
  assert.ok(!new RegExp("[\\u0000-\\u001f\\u007f]").test(violation.sample));
  assert.equal(violation.sample, `alert(1) csp-violation {"directive":"forged"}`);
  assert.equal(violation.blockedUrl.length, 300);
  assert.ok(violation.blockedUrl.endsWith("…"));
  // A hyphen is ordinary URL punctuation, not a control character.
  assert.equal(normalizeCspReports({ "effective-directive": "script-src-elem" })[0]?.directive, "script-src-elem");
});

// `/reset-password?token=…` holds a live credential in the query, and the spec's report-stripping
// keeps query strings. A violation raised there must not copy the token into the log.
test("a reported URL keeps its page and drops its query", () => {
  const violations = normalizeCspReports({
    "csp-report": {
      "effective-directive": "script-src",
      "document-uri": "https://www.opinacraft.com/reset-password?token=live-secret-token#frag",
      "blocked-uri": "https://cdn.example.com/tag.js?key=another-secret",
    },
  });
  const violation = violations[0];
  assert.ok(violation);
  assert.equal(violation.documentUrl, "https://www.opinacraft.com/reset-password");
  assert.equal(violation.blockedUrl, "https://cdn.example.com/tag.js");
  assert.ok(!violation.documentUrl.includes("live-secret-token"));
  assert.ok(!violation.blockedUrl.includes("another-secret"));
  // Credentials in the URL itself go the same way.
  assert.equal(
    normalizeCspReports({ "effective-directive": "img-src", "blocked-uri": "https://user:pass@example.com/a.png?q=1" })[0]?.blockedUrl,
    "https://example.com/a.png",
  );
});

test("a reported source that is not a URL survives as itself", () => {
  const source = (blocked: string) => normalizeCspReports({ "effective-directive": "script-src", "blocked-uri": blocked })[0]?.blockedUrl;
  // CSP names some sources by keyword rather than URL.
  assert.equal(source("inline"), "inline");
  assert.equal(source("eval"), "eval");
  assert.equal(source(""), "");
  // A data URL is all payload; the scheme is what identifies it.
  assert.equal(source("data:image/svg+xml;base64,PHN2Zw=="), "data");
  assert.equal(source("blob:https://www.opinacraft.com/8f7c"), "blob");
});

test("a batch is capped", () => {
  const entry = { type: "csp-violation", body: { effectiveDirective: "img-src" } };
  assert.equal(normalizeCspReports(Array.from({ length: 50 }, () => entry)).length, 20);
});

function postReport(body: BodyInit, headers: Record<string, string>, init: RequestInit = {}) {
  return POST(new Request("https://www.opinacraft.com/api/csp-report", { method: "POST", headers, body, ...init }));
}

// The endpoint answers the same way to everything, so what it does is visible only in what it logs.
function captureWarnings(run: () => Promise<unknown>) {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  return run().finally(() => { console.warn = original; }).then(() => warnings);
}

test("the endpoint reads a report and answers 204 to everything", async () => {
  const body = JSON.stringify({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js" } });
  const warnings = await captureWarnings(async () => {
    const response = await postReport(body, { "content-type": "application/csp-report", "content-length": String(body.length) });
    assert.equal(response.status, 204);
  });
  assert.equal(warnings.length, 1);
  assert.equal((warnings[0]?.[1] as { directive: string }).directive, "script-src-elem");
});

test("a body that is not a report is dropped without a word", async () => {
  const warnings = await captureWarnings(async () => {
    // Wrong content type.
    assert.equal((await postReport("junk", { "content-type": "text/plain", "content-length": "4" })).status, 204);
    // Honest oversized length.
    assert.equal((await postReport("{}", { "content-type": "application/json", "content-length": String(200 * 1024) })).status, 204);
    // Malformed JSON.
    assert.equal((await postReport("not-json", { "content-type": "application/json", "content-length": "8" })).status, 204);
  });
  assert.deepEqual(warnings, []);
});

// A chunked request carries no `Content-Length`, so a guard that only reads the header waves it
// through and buffers the whole body. The limit has to be counted against the bytes arriving.
test("an oversized body is refused even with no Content-Length to declare it", async () => {
  const oversized = `{"csp-report":{"effective-directive":"script-src","script-sample":"${"a".repeat(100 * 1024)}"}}`;
  const stream = new ReadableStream({
    start(controller) {
      const encoded = new TextEncoder().encode(oversized);
      for (let offset = 0; offset < encoded.byteLength; offset += 8192) controller.enqueue(encoded.slice(offset, offset + 8192));
      controller.close();
    },
  });
  const warnings = await captureWarnings(async () => {
    const response = await postReport(stream, { "content-type": "application/csp-report" }, { duplex: "half" } as RequestInit);
    assert.equal(response.status, 204);
  });
  // Nothing logged: the read gave up before the body was whole.
  assert.deepEqual(warnings, []);
});

test("a chunked body within the limit is still read", async () => {
  const body = JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "font-src" } }]);
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); },
  });
  const warnings = await captureWarnings(async () => {
    assert.equal((await postReport(stream, { "content-type": "application/reports+json" }, { duplex: "half" } as RequestInit)).status, 204);
  });
  assert.equal(warnings.length, 1);
});

// A Report-Only policy that names no endpoint is evaluated and thrown away. Both directives are
// present because neither is supported everywhere, and both stay relative so reports are
// same-origin on every deployment.
test("the policy names the endpoint that collects it", () => {
  const config = readProjectFile("next.config.ts");
  assert.match(config, /report-uri \$\{cspReportPath\}/);
  assert.match(config, /report-to csp-endpoint/);
  assert.match(config, /"Reporting-Endpoints", value: `csp-endpoint="\$\{cspReportPath\}"`/);
  assert.match(config, /const cspReportPath = "\/api\/csp-report"/);
  assert.ok(existsSync(path.resolve("src/app/api/csp-report/route.ts")));
});
