import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

const readProjectFile = (filePath: string) =>
  readFileSync(path.resolve(filePath), "utf8");

test("optimizes the icon package imports used across the app", () => {
  const source = readProjectFile("next.config.ts");

  assert.match(source, /optimizePackageImports:/);
  assert.match(source, /["']lucide-react["']/);
  assert.match(source, /["']@tabler\/icons-react["']/);
});

test("starts public server viewer data with the other page queries", () => {
  const source = readProjectFile("src/app/servers/[slug]/page.tsx");

  assert.match(source, /const viewerPromise = session \?/);
  assert.match(source, /viewerPromise/);
  assert.doesNotMatch(source, /const viewer = session \? await getReviewViewerState/);
});

test("passes a shaped payload to the server manage client boundary", () => {
  const source = readProjectFile("src/app/servers/[slug]/manage/page.tsx");

  assert.match(source, /toServerManageFormData/);
  assert.match(source, /<ServerManageForm server=\{serverFormData\}/);
  assert.doesNotMatch(source, /<ServerManageForm server=\{server\}/);
});

test("narrows profile effects to the authenticated user identity", () => {
  const source = readProjectFile("src/app/profile/page.tsx");

  assert.match(source, /session\?\.user\?\.id/);
  assert.doesNotMatch(source, /\}, \[session\]\);/);
});

test("keeps sortable header hover compact without rounded edges", () => {
  const source = readProjectFile("src/app/servers/page.tsx");
  const headerSource = source.slice(
    source.indexOf("function SortableColumnHeader"),
    source.indexOf("function countLabel"),
  );
  const linkClass = headerSource.match(/<Link[\s\S]*?className="([^"]+)"/)?.[1];

  assert.doesNotMatch(
    headerSource,
    /<div role="columnheader"[^>]*className="[^\"]*hover:bg-muted\/60[^\"]*"/,
  );
  assert.ok(linkClass, "sortable header link should have a class list");
  assert.match(linkClass, /\binline-flex\b/);
  assert.doesNotMatch(linkClass, /(?:^|\s)w-full(?:\s|$)/);
  assert.doesNotMatch(linkClass, /\brounded-md\b/);
  assert.match(linkClass, /\bpx-1\b/);
  assert.match(linkClass, /\bhover:bg-muted\/60\b/);
});

test("synchronizes the catalog sort control with sortable table state", () => {
  const source = readProjectFile("src/app/servers/page.tsx");

  assert.match(source, /const activeTableSort = tableSort \?\?/);
  assert.match(source, /const activeTableDirection(?:[^=]*)= tableSort \?/);
  assert.match(source, /defaultValue=\{tableSort \? "table" : sort\}/);
  assert.match(source, /<option value="table" disabled>/);
});

test("does not apply app lint rules to bundled skill scripts", async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles([
    ".agents/skills/brainstorming/scripts/server.cjs",
    ".claude/skills/brainstorming/scripts/server.cjs",
  ]);
  const errors = results.flatMap((result) =>
    result.messages.filter((message) => message.severity === 2),
  );

  assert.deepEqual(errors, []);
});

test("code-splits the Recharts history visualization", () => {
  const cardSource = readProjectFile("src/components/player-history-card.tsx");
  const chartPath = path.resolve("src/components/player-history-chart.tsx");

  assert.equal(
    existsSync(chartPath),
    true,
    "the Recharts visualization should live in its own component",
  );

  const chartSource = readFileSync(chartPath, "utf8");

  assert.match(cardSource, /next\/dynamic/);
  assert.match(cardSource, /ssr:\s*false/);
  assert.doesNotMatch(cardSource, /from ["']recharts["']/);
  assert.match(chartSource, /from ["']recharts["']/);
});
