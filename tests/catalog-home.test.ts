import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildCatalogHref } from "@/lib/servers/catalog-route";

const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

test("builds the catalog home URL while preserving supported filters", () => {
  assert.equal(
    buildCatalogHref({ q: "  survival  ", edition: "java", status: "online", page: "2" }),
    "/?q=survival&edition=java&status=online&page=2",
  );
});

test("drops empty and unsupported values from the catalog home URL", () => {
  assert.equal(
    buildCatalogHref({ q: " ", mode: "pvp", callbackURL: "/profile", unknown: "ignored" }),
    "/?mode=pvp",
  );
});

test("renders the catalog at the home route and permanently aliases /servers", () => {
  const homeSource = readProjectFile("src/app/page.tsx");
  const configSource = readProjectFile("next.config.ts");

  assert.match(homeSource, /PublicServersPage/);
  assert.match(configSource, /source: "\/servers"/);
  assert.match(configSource, /destination: "\/"/);
  assert.match(configSource, /permanent: true/);
});

test("uses the home route for catalog navigation and sitemap discovery", () => {
  const catalogSource = readProjectFile("src/app/servers/page.tsx");
  const headerSource = readProjectFile("src/components/site-header.tsx");
  const sitemapSource = readProjectFile("src/app/sitemap.ts");

  assert.match(catalogSource, /form action=\{catalogPath\} method="get"/);
  assert.match(catalogSource, /buildCatalogHref/);
  assert.match(headerSource, /router\.push\(nextQuery \? `\/\?q=/);
  assert.doesNotMatch(sitemapSource, /\$\{base\}\/servers`,/);
});

test("keeps the catalog reachable from the brand without a duplicate primary-nav link", () => {
  const headerSource = readProjectFile("src/components/site-header.tsx");

  assert.match(headerSource, /aria-label=\"OpinaCraft, inicio\"/);
  assert.equal(headerSource.includes('label: "Servidores", href: "/"'), false);
  assert.equal(headerSource.includes('label: "Mis servidores", href: "/dashboard/servers"'), true);
});

test("links the blog from the desktop and mobile header navigation", () => {
  const headerSource = readProjectFile("src/components/site-header.tsx");

  assert.match(headerSource, /label: "Blog", href: "\/blog"/);
  assert.match(
    headerSource,
    /MobileNavigationSection label="Explorar" items=\{publicItems\}/,
  );
});
