import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("keeps system catalog pills icon-led while user tags stay text-only", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");
  const systemPillSource = source.slice(
    source.indexOf("function SystemBadge"),
    source.indexOf("export function PublicServerRow"),
  );
  const userTagsStart = source.indexOf("{server.tags.slice");
  const userTagsSource = source.slice(userTagsStart, source.indexOf("</div>", userTagsStart));

  assert.match(source, /<SystemBadge icon=\{<ClipboardCheck aria-hidden="true" className="size-3" \/>\}/);
  assert.match(source, /<SystemBadge icon=\{<Users aria-hidden="true" className="size-3" \/>\}/);
  assert.match(systemPillSource, /<Badge variant="outline" className="text-\[0\.625rem\]">\s*\{icon\}\s*\{children\}\s*<\/Badge>/);
  assert.match(userTagsSource, /<Badge key=\{tag\.slug\} variant="outline" className="text-\[0\.625rem\]">\{tag\.label\}<\/Badge>/);
  assert.doesNotMatch(userTagsSource, /SystemBadge|ClipboardCheck|Users|<svg/);
  assert.doesNotMatch(source, /<Badge className="text-\[0\.625rem\]">/);
  assert.doesNotMatch(source, /bg-success-soft/);
});

test("keeps access requests on the server page instead of catalog rows", () => {
  const source = readFileSync(path.resolve("src/components/public-server-row.tsx"), "utf8");

  assert.doesNotMatch(source, /Solicitar acceso/);
  assert.doesNotMatch(source, /server\.accessFormUrl/);
});
