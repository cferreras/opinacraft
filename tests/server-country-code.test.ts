import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type ServerCountryCodeProps = {
  code: string | null | undefined;
  className?: string;
};

async function loadServerCountryCode() {
  const componentPath = path.resolve("src/components/server-country-code.ts");
  try {
    const imported = await import(pathToFileURL(componentPath).href);
    return imported.ServerCountryCode as ComponentType<ServerCountryCodeProps>;
  } catch (error) {
    assert.fail(`The server country code renderer must be importable: ${String(error)}`);
  }
}

test("renders the uppercase country code with its full accessible name", async () => {
  const ServerCountryCode = await loadServerCountryCode();
  const markup = renderToStaticMarkup(createElement(ServerCountryCode, { code: "es" }));

  assert.equal(markup.replace(/<[^>]+>/g, ""), "ES");
  assert.match(markup, /aria-label="País: España"/);
});

test("uses a compact international code and hides missing or unknown countries", async () => {
  const ServerCountryCode = await loadServerCountryCode();

  assert.equal(
    renderToStaticMarkup(createElement(ServerCountryCode, { code: "global" })).replace(/<[^>]+>/g, ""),
    "INTL",
  );
  assert.equal(renderToStaticMarkup(createElement(ServerCountryCode, { code: null })), "");
  assert.equal(renderToStaticMarkup(createElement(ServerCountryCode, { code: "zz" })), "");
});
