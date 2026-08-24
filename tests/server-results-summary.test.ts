import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { formatServerResultsLabel, getServerResultsSummary } from "../src/lib/servers/result-summary.ts";

test("formats the visible range and filtered server total", () => {
  assert.equal(
    formatServerResultsLabel({ page: 1, pageSize: 24, visibleCount: 5, totalCount: 17 }),
    "Mostrando 1–5 de 17 servidores",
  );
  assert.equal(
    formatServerResultsLabel({ page: 2, pageSize: 24, visibleCount: 5, totalCount: 29 }),
    "Mostrando 25–29 de 29 servidores",
  );
  assert.equal(
    formatServerResultsLabel({ page: 1, pageSize: 24, visibleCount: 1, totalCount: 1 }),
    "Mostrando 1 de 1 servidor",
  );
});

test("exposes the range and total as separate emphasis values", () => {
  assert.deepEqual(
    getServerResultsSummary({ page: 1, pageSize: 24, visibleCount: 5, totalCount: 17 }),
    { rangeLabel: "1–5", totalCount: 17, serverLabel: "servidores" },
  );
});

test("renders the summary from the page result total", () => {
  const source = readFileSync(path.resolve("src/app/servers/page.tsx"), "utf8");

  assert.match(source, /const \{ hasNextPage, page, totalCount \} = result/);
  assert.match(source, /getServerResultsSummary\(/);
});

test("keeps the Neon catalog total exact instead of using the pagination probe", () => {
  const source = readFileSync(path.resolve("src/lib/servers/queries.ts"), "utf8");

  assert.match(source, /totalCount: sql<number>`count\(\*\) over\(\)::int`/);
  assert.match(source, /const totalCount = serverIds\[0\]\?\.totalCount \?\? 0/);
});
