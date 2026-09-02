import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

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

test("a batch is capped", () => {
  const entry = { type: "csp-violation", body: { effectiveDirective: "img-src" } };
  assert.equal(normalizeCspReports(Array.from({ length: 50 }, () => entry)).length, 20);
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
