import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  gameModeLabel,
  gameModes,
  MAX_SERVER_GAME_MODES,
  normalizeGameModeInputs,
  parseGameModeParam,
} from "@/lib/servers/game-modes";
import { normalizeCountryInput, parseCountryParam, serverCountries } from "@/lib/servers/countries";
import * as catalogFilters from "@/lib/servers/catalog-filters";
import {
  REPORTED_PADDING_SQL_PATTERN,
  catalogVersionOptions,
  compareMinecraftVersions,
  isFullMinecraftVersion,
  isMinecraftVersion,
  minecraftVersionsIn,
  parseVersionParam,
  primaryMinecraftVersion,
  sortMinecraftVersions,
  withoutReportedPadding,
} from "@/lib/servers/minecraft-version";

const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

test("catalog access parser accepts only the four public categories", () => {
  const parseCatalogAccessParam = (catalogFilters as unknown as {
    parseCatalogAccessParam?: (value: string | undefined) => string | undefined;
  }).parseCatalogAccessParam;

  assert.equal(typeof parseCatalogAccessParam, "function", "the catalog should own a typed access parser");
  assert.equal(parseCatalogAccessParam?.("premium"), "premium");
  assert.equal(parseCatalogAccessParam?.("non-premium"), "non-premium");
  assert.equal(parseCatalogAccessParam?.("semi-premium"), "semi-premium");
  assert.equal(parseCatalogAccessParam?.("whitelist"), "whitelist");
  assert.equal(parseCatalogAccessParam?.("open"), undefined);
  assert.equal(parseCatalogAccessParam?.("unknown"), undefined);
  assert.equal(parseCatalogAccessParam?.(undefined), undefined);
});

test("catalog access categories map to exclusive stored profiles", () => {
  const catalogAccessCriteria = (catalogFilters as unknown as {
    catalogAccessCriteria?: (value: string) => {
      accessType: string;
      accountMode?: string;
      authMode?: string;
    };
  }).catalogAccessCriteria;

  assert.equal(typeof catalogAccessCriteria, "function", "the query should consume one shared access mapping");
  assert.deepEqual(catalogAccessCriteria?.("premium"), {
    accessType: "open",
    accountMode: "premium_only",
    authMode: "direct",
  });
  assert.deepEqual(catalogAccessCriteria?.("non-premium"), {
    accessType: "open",
    accountMode: "premium_and_non_premium",
    authMode: "password_all",
  });
  assert.deepEqual(catalogAccessCriteria?.("semi-premium"), {
    accessType: "open",
    accountMode: "premium_and_non_premium",
    authMode: "password_non_premium",
  });
  assert.deepEqual(catalogAccessCriteria?.("whitelist"), { accessType: "whitelist" });
});

test("catalog access categories emit exclusive SQL conditions", () => {
  const catalogAccessCondition = (catalogFilters as unknown as {
    catalogAccessCondition?: (value: string) => SQL;
  }).catalogAccessCondition;

  assert.equal(typeof catalogAccessCondition, "function", "the catalog query should share the tested access condition");
  const dialect = new PgDialect();
  const queryFor = (value: string) => dialect.sqlToQuery(catalogAccessCondition!(value));

  assert.deepEqual(queryFor("premium"), {
    sql: "((\"servers\".\"access_type\" = $1) and (\"servers\".\"account_mode\" = $2) and (\"servers\".\"auth_mode\" = $3))",
    params: ["open", "premium_only", "direct"],
  });
  assert.deepEqual(queryFor("non-premium"), {
    sql: "((\"servers\".\"access_type\" = $1) and (\"servers\".\"account_mode\" = $2) and (\"servers\".\"auth_mode\" = $3))",
    params: ["open", "premium_and_non_premium", "password_all"],
  });
  assert.deepEqual(queryFor("semi-premium"), {
    sql: "((\"servers\".\"access_type\" = $1) and (\"servers\".\"account_mode\" = $2) and (\"servers\".\"auth_mode\" = $3))",
    params: ["open", "premium_and_non_premium", "password_non_premium"],
  });
  assert.deepEqual(queryFor("whitelist"), {
    sql: "\"servers\".\"access_type\" = $1",
    params: ["whitelist"],
  });
});

test("catalog access choices expose the approved Minecraft taxonomy", () => {
  assert.deepEqual(catalogFilters.catalogAccessOptions, [
    { value: "", label: "Todos" },
    { value: "premium", label: "Solo premium" },
    { value: "non-premium", label: "No-premium" },
    { value: "semi-premium", label: "Semi-premium" },
    { value: "whitelist", label: "Whitelist" },
  ]);
});

test("the mode vocabulary is closed, unique and split into both groups", () => {
  const slugs = gameModes.map((mode) => mode.slug);

  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.every((slug) => /^[a-z0-9-]+$/.test(slug)), "slugs are the URL contract");
  assert.ok(gameModes.some((mode) => mode.group === "popular"));
  assert.ok(gameModes.some((mode) => mode.group === "niche"));
});

test("only known modes survive the form, in catalogue order and capped", () => {
  assert.deepEqual(normalizeGameModeInputs(["Skyblock", "SURVIVAL"]), ["survival", "skyblock"]);
  assert.deepEqual(normalizeGameModeInputs(["supervivencia", "pvp libre"]), []);
  assert.deepEqual(normalizeGameModeInputs(undefined), []);
  assert.equal(normalizeGameModeInputs(gameModes.map((mode) => mode.slug)).length, MAX_SERVER_GAME_MODES);
});

test("an unknown mode in the query string means no mode filter", () => {
  assert.equal(parseGameModeParam("survival"), "survival");
  assert.equal(parseGameModeParam(" Survival "), "survival");
  assert.equal(parseGameModeParam("no-existe"), undefined);
  assert.equal(parseGameModeParam(undefined), undefined);
  assert.equal(gameModeLabel("skyblock"), "Skyblock");
});

test("countries are ISO codes plus the explicit global option", () => {
  const codes = serverCountries.map((country) => country.code);

  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("es") && codes.includes("mx") && codes.includes("global"));
  assert.equal(parseCountryParam("ES"), "es");
  assert.equal(parseCountryParam("zz"), undefined);
  assert.equal(normalizeCountryInput(" ar "), "ar");
  assert.equal(normalizeCountryInput(""), null);
});

test("reads every major version out of what the monitor reported", () => {
  assert.deepEqual(minecraftVersionsIn("Paper 1.21.4"), ["1.21"]);
  assert.deepEqual(minecraftVersionsIn("Purpur 26.2"), ["26.2"]);
  assert.deepEqual(minecraftVersionsIn("26.2"), ["26.2"]);
  assert.deepEqual(minecraftVersionsIn("1.8-1.21"), ["1.8", "1.21"]);
  assert.deepEqual(minecraftVersionsIn("Requires MC 1.20"), ["1.20"]);
  assert.deepEqual(minecraftVersionsIn(null), []);
});

test("a multiversion proxy is headlined by its newest version", () => {
  assert.equal(primaryMinecraftVersion("1.8-1.21"), "1.21");
  assert.equal(primaryMinecraftVersion("Paper 1.20.6"), "1.20");
  assert.equal(primaryMinecraftVersion("desconocida"), null);
});

test("versions sort by number, not by text", () => {
  assert.deepEqual(sortMinecraftVersions(["1.9", "1.21", "1.8", "1.21"]), ["1.21", "1.9", "1.8"]);
  assert.ok(compareMinecraftVersions("1.21", "1.9") > 0);
});

test("bare majors and full reported versions reach the SQL filter", () => {
  assert.equal(parseVersionParam("1.21"), "1.21");
  assert.equal(parseVersionParam("26.2"), "26.2");
  // Full strings the monitor actually reports stay their own option instead of collapsing.
  assert.equal(parseVersionParam("Purpur 26.2"), "Purpur 26.2");
  assert.equal(parseVersionParam("Paper 1.21.7"), "Paper 1.21.7");
  assert.equal(parseVersionParam("1.21.4"), "1.21.4");
  assert.equal(parseVersionParam("1.8-1.21"), "1.8-1.21");
  assert.ok(isMinecraftVersion("26.2"));
  assert.ok(!isMinecraftVersion("Purpur 26.2"));
  assert.ok(isFullMinecraftVersion("Purpur 26.2"));
  assert.ok(!isFullMinecraftVersion("desconocida"));
  assert.equal(parseVersionParam("desconocida"), undefined);
  assert.equal(parseVersionParam("'; drop table servers; --"), undefined);
});

test("full reported versions stay side by side instead of collapsing", () => {
  assert.deepEqual(catalogVersionOptions(["26.2", "Purpur 26.2", "Purpur 26.2 "]), ["26.2", "Purpur 26.2"]);
  assert.deepEqual(catalogVersionOptions(["1.21.8", "Paper 1.21.7", "1.8-1.21"]), ["1.21.8", "1.8-1.21", "Paper 1.21.7"]);
});

test("the version options are exactly what the query string accepts back", () => {
  // A report the parser would reject must never become an option: selecting it would drop the
  // filter and run the unfiltered catalog, so the dropdown would offer a filter that does nothing.
  assert.deepEqual(catalogVersionOptions(["Java", "desconocida", null, "", "  ", "§aPaper 1.21", "Purpur 26.2"]), ["Purpur 26.2"]);
  for (const option of catalogVersionOptions(["Paper 1.21.7 ", "1.8-1.21", "Vanilla 1.20.1"])) {
    assert.equal(parseVersionParam(option), option, `${option} should survive the query-string guard unchanged`);
  }
});

test("the exact version filter strips the same padding the option list stripped", () => {
  const source = readProjectFile("src/lib/servers/queries.ts");

  // The predicate has to share the pattern, not restate it: `btrim` covers ordinary spaces only,
  // so a report padded with a tab would show an option that then matches no server.
  assert.match(source, /regexp_replace\(coalesce\(\$\{servers\.monitorVersion\}, ''\), \$\{REPORTED_PADDING_SQL_PATTERN\}, '', 'g'\) = \$\{version\}/);
  assert.doesNotMatch(source, /btrim\(coalesce|eq\(servers\.monitorVersion, version\)/);

  for (const padded of ["Purpur 26.2 ", "Purpur 26.2\t", "\nPurpur 26.2\r", "\fPurpur 26.2\v"]) {
    assert.equal(withoutReportedPadding(padded), "Purpur 26.2");
    assert.deepEqual(catalogVersionOptions([padded]), ["Purpur 26.2"]);
  }
  // Every padding character the JS side strips is in the pattern Postgres gets, and no other.
  assert.equal(REPORTED_PADDING_SQL_PATTERN, "^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$");
  // Padding the SQL side would keep must not become an option either: a non-breaking space
  // survives both sides, and the facet's charset then rejects it instead of offering a filter
  // that matches nothing.
  assert.equal(withoutReportedPadding("Purpur 26.2\u00a0"), "Purpur 26.2\u00a0");
  assert.deepEqual(catalogVersionOptions(["Purpur 26.2\u00a0"]), []);
});

test("the filter bar offers exactly the five facets of the catalog", () => {
  const source = readProjectFile("src/components/catalog-filter-bar.tsx");

  for (const [name, label] of [["mode", "Modo"], ["version", "Versión"], ["country", "País"], ["access", "Acceso"], ["edition", "Edición"]]) {
    assert.match(source, new RegExp(`name="${name}" label="${label}"`), `${label} should be a filter pill`);
  }
  assert.match(source, /Borrar filtros/);
  // Ordering belongs to the results table header, and health is visible on every row.
  assert.doesNotMatch(source, /name="sort"|name="status"/);
});

test("the catalog reads every facet back out of the query string", () => {
  const source = readProjectFile("src/app/servers/page.tsx");

  assert.match(source, /const mode = parseGameModeParam\(query\.mode\)/);
  assert.match(source, /const version = parseVersionParam\(query\.version\)/);
  assert.match(source, /const country = parseCountryParam\(query\.country\)/);
  // The bar lost its sort control, so the form has to carry the visitor's ordering itself.
  assert.match(source, /name="sort" value=\{sort\}/);
});
