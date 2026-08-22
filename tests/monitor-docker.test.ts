import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("monitor worker Dockerfile copies pnpm build approval config before installing", () => {
  const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile.monitor-worker"), "utf8");
  const copyIndex = dockerfile.indexOf("COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./");
  const installIndex = dockerfile.indexOf("RUN pnpm install --frozen-lockfile");

  assert.notEqual(copyIndex, -1);
  assert.notEqual(installIndex, -1);
  assert.ok(copyIndex < installIndex);
});

test("monitor worker is isolated from the Neon database boundary", () => {
  const worker = readFileSync(resolve(repositoryRoot, "src/workers/monitor-worker.ts"), "utf8");
  assert.doesNotMatch(worker, /@\/db|(?<!MONITOR_)DATABASE_URL/);
  assert.match(worker, /MONITOR_DATABASE_URL/);
  assert.match(worker, /pg-boss|createMonitorBoss/);
});

test("Monitor API has its own Dokploy service definition", () => {
  const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile.monitor-api"), "utf8");
  assert.match(dockerfile, /monitor:api/);
  assert.match(dockerfile, /3002/);
});
