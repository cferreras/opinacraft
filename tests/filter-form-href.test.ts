import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildFilterFormHref } from "@/lib/servers/filter-form-href";

const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

test("keeps the form action when no filter carries a value", () => {
  const href = buildFilterFormHref({ action: "/servers", entries: [["q", ""], ["mode", ""]] });

  assert.equal(href, "/servers");
});

test("serializes the filled filters into the query string", () => {
  const href = buildFilterFormHref({
    action: "/servers",
    entries: [["q", "survival"], ["edition", "java"], ["status", ""], ["mode", "pvp"]],
  });

  assert.equal(href, "/servers?q=survival&edition=java&mode=pvp");
});

test("trims the search term and drops it when only whitespace remains", () => {
  assert.equal(buildFilterFormHref({ action: "/servers", entries: [["q", "  survival  "]] }), "/servers?q=survival");
  assert.equal(buildFilterFormHref({ action: "/servers", entries: [["q", "   "]] }), "/servers");
});

test("resets pagination unless the caller keeps the current page", () => {
  const entries: [string, string][] = [["mode", "pvp"], ["page", "3"]];

  assert.equal(buildFilterFormHref({ action: "/servers", entries }), "/servers?mode=pvp");
  assert.equal(buildFilterFormHref({ action: "/servers", entries, keepPage: "3" }), "/servers?mode=pvp&page=3");
  assert.equal(buildFilterFormHref({ action: "/servers", entries, keepPage: null }), "/servers?mode=pvp");
});

test("skips the fields the changed control invalidates", () => {
  const href = buildFilterFormHref({
    action: "/servers",
    entries: [["sort", "players"], ["tableSort", "name"], ["tableDirection", "asc"]],
    clearFields: ["tableSort", "tableDirection"],
  });

  assert.equal(href, "/servers?sort=players");
});

test("ignores the file entries a form may carry", () => {
  const href = buildFilterFormHref({ action: "/servers", entries: [["logo", new Blob(["x"]) as unknown as FormDataEntryValue], ["q", "survival"]] });

  assert.equal(href, "/servers?q=survival");
});

test("navigates the catalog filters with the router instead of a native submit", () => {
  for (const file of ["src/components/filter-select.tsx", "src/components/server-search-input.tsx"]) {
    const source = readProjectFile(file);

    assert.match(source, /useFilterFormNavigation/, `${file} should navigate through the shared hook`);
    assert.doesNotMatch(source, /requestSubmit/, `${file} should not trigger a full page reload`);
  }

  assert.match(readProjectFile("src/app/servers/page.tsx"), /<form action=\{catalogPath\} method="get"/, "the form action stays as the no-JS fallback");
});
