import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("keeps system catalog pills icon-led while game modes stay text-only", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");
  const systemPillSource = source.slice(
    source.indexOf("function SystemBadge"),
    source.indexOf("export function PublicServerRow"),
  );
  const gameModesStart = source.indexOf("{server.gameModes.slice");
  const gameModesSource = source.slice(gameModesStart, source.indexOf("</div>", gameModesStart));

  assert.match(source, /<SystemBadge icon=\{<ClipboardCheck aria-hidden="true" className="size-3" \/>\}/);
  assert.match(source, /<SystemBadge icon=\{<Users aria-hidden="true" className="size-3" \/>\}/);
  assert.match(systemPillSource, /<Badge variant="outline" className="text-\[0\.625rem\]">\s*\{icon\}\s*\{children\}\s*<\/Badge>/);
  assert.match(gameModesSource, /<Badge key=\{mode\} variant="outline" className="text-\[0\.625rem\]">\{gameModeLabel\(mode\)\}<\/Badge>/);
  assert.doesNotMatch(gameModesSource, /SystemBadge|ClipboardCheck|Users|<svg/);
  assert.doesNotMatch(source, /<Badge className="text-\[0\.625rem\]">/);
  assert.doesNotMatch(source, /bg-success-soft/);
});

test("keeps access requests on the server page instead of catalog rows", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");

  assert.doesNotMatch(source, /Solicitar acceso/);
  assert.doesNotMatch(source, /server\.accessFormUrl/);
});
