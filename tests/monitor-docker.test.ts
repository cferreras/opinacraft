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
