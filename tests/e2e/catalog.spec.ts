import { expect, test } from "@playwright/test";

import {
  cleanupAccounts,
  createAccount,
  createServer,
  markServerVerified,
  publishServer,
  setEndpointHealth,
} from "./helpers";

const createdEmails: string[] = [];

test.afterAll(async () => {
  await cleanupAccounts(createdEmails);
});

test("public catalog searches and filters by text, tags, edition and health", async ({ page }) => {
  const owner = await createAccount(page, "catalog");
  createdEmails.push(owner.email);

  const alphaName = `E2E Alpha ${Date.now()}`;
  const betaName = `E2E Beta ${Date.now()}`;
  const alpha = await createServer(page, {
    name: alphaName,
    javaHost: `alpha-java-${Date.now()}.example.invalid`,
    bedrockHost: `alpha-bedrock-${Date.now()}.example.invalid`,
    tags: ["pvp", "spanish"],
  });
  await markServerVerified(alpha.slug, ["java", "bedrock"]);
  await publishServer(page, alpha.slug);
  await setEndpointHealth(alpha.slug, "java", "online");

  const beta = await createServer(page, {
    name: betaName,
    javaHost: `beta-java-${Date.now()}.example.invalid`,
    tags: ["creative"],
  });
  await markServerVerified(beta.slug);
  await publishServer(page, beta.slug);
  await setEndpointHealth(beta.slug, "java", "offline");

  await page.goto("/servers");
  await expect(page.getByRole("heading", { name: alphaName })).toBeVisible();
  await expect(page.getByRole("heading", { name: betaName })).toBeVisible();

  await page.getByLabel("Buscar", { exact: true }).fill("Alpha");
  await page.getByLabel("Buscar", { exact: true }).press("Enter");
  await page.getByLabel("Edición").selectOption("bedrock");
  await expect(page).toHaveURL(/q=Alpha/);
  await expect(page).toHaveURL(/edition=bedrock/);
  await expect(page.getByRole("heading", { name: alphaName })).toBeVisible();
  await expect(page.getByRole("heading", { name: betaName })).toHaveCount(0);

  await page.goto("/servers?tags=pvp");
  await expect(page.getByRole("heading", { name: alphaName })).toBeVisible();
  await expect(page.getByRole("heading", { name: betaName })).toHaveCount(0);

  await page.goto("/servers?status=offline");
  await expect(page.getByRole("heading", { name: betaName })).toBeVisible();
  await expect(page.getByRole("heading", { name: alphaName })).toHaveCount(0);
});

test("syncs the selected tag pill after client-side catalog navigation", async ({ page }) => {
  const owner = await createAccount(page, "catalog-tag-pill");
  createdEmails.push(owner.email);

  const stamp = Date.now();
  const server = await createServer(page, {
    name: `E2E Tag Pill ${stamp}`,
    javaHost: `tag-pill-${stamp}.example.invalid`,
    tags: ["supervivencia"],
  });
  await markServerVerified(server.slug);
  await publishServer(page, server.slug);

  await page.goto("/servers?tags=supervivencia");
  await expect(page.getByRole("button", { name: "Eliminar supervivencia" })).toBeVisible();

  await page.getByRole("link", { name: "Limpiar filtros", exact: true }).click();
  await expect(page).toHaveURL(/\/servers$/);
  await expect(page.getByRole("button", { name: "Eliminar supervivencia" })).toHaveCount(0);
});

test("public catalog headers sort the visible columns and toggle direction", async ({ page }) => {
  const owner = await createAccount(page, "catalog-sort");
  createdEmails.push(owner.email);

  const stamp = Date.now();
  const alphaName = `E2E Sort Alpha ${stamp}`;
  const betaName = `E2E Sort Beta ${stamp}`;
  const alpha = await createServer(page, {
    name: alphaName,
    javaHost: `sort-alpha-${stamp}.example.invalid`,
  });
  await markServerVerified(alpha.slug);
  await publishServer(page, alpha.slug);

  const beta = await createServer(page, {
    name: betaName,
    javaHost: `sort-beta-${stamp}.example.invalid`,
  });
  await markServerVerified(beta.slug);
  await publishServer(page, beta.slug);

  await page.goto("/servers");
  await expect(page.getByLabel("Ordenar", { exact: true })).toHaveValue("rating");
  await expect(page.getByRole("columnheader", { name: "Valoración" })).toHaveAttribute("aria-sort", "descending");

  await page.goto(`/servers?q=${encodeURIComponent(`E2E Sort ${stamp}`)}`);
  await expect(page.getByRole("heading", { name: alphaName })).toBeVisible();
  await expect(page.getByRole("heading", { name: betaName })).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(7);
  await expect(page.getByRole("link", { name: /^Ordenar por / })).toHaveCount(7);

  await expect(page.getByRole("columnheader", { name: "Servidor" })).toHaveAttribute("aria-sort", "none");
  await page.getByRole("link", { name: "Ordenar por Servidor ascendente" }).click();
  await expect(page).toHaveURL(/tableSort=name/);
  await expect(page).toHaveURL(/tableDirection=asc/);
  await expect(page.getByLabel("Ordenar", { exact: true })).toHaveValue("table");
  await expect(page.getByLabel("Ordenar", { exact: true }).locator("option:checked")).toHaveText("Servidor · ascendente");
  await expect(page.getByRole("columnheader", { name: "Servidor" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("article h3").nth(0)).toHaveText(alphaName);
  await expect(page.locator("article h3").nth(1)).toHaveText(betaName);

  await page.getByLabel("Edición", { exact: true }).selectOption("java");
  await expect(page).toHaveURL(/tableSort=name/);
  await expect(page).toHaveURL(/tableDirection=asc/);
  await expect(page.getByLabel("Ordenar", { exact: true })).toHaveValue("table");
  await expect(page.getByRole("columnheader", { name: "Servidor" })).toHaveAttribute("aria-sort", "ascending");

  await page.getByRole("link", { name: "Ordenar por Servidor descendente" }).click();
  await expect(page).toHaveURL(/tableDirection=desc/);
  await expect(page.getByLabel("Ordenar", { exact: true }).locator("option:checked")).toHaveText("Servidor · descendente");
  await expect(page.getByRole("columnheader", { name: "Servidor" })).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("article h3").nth(0)).toHaveText(betaName);
  await expect(page.locator("article h3").nth(1)).toHaveText(alphaName);

  await page.getByLabel("Ordenar", { exact: true }).selectOption("players");
  await expect(page).toHaveURL(/sort=players/);
  await expect(page).not.toHaveURL(/tableSort=/);
  await expect(page.getByLabel("Ordenar", { exact: true })).toHaveValue("players");
  await expect(page.getByRole("columnheader", { name: "Jugadores" })).toHaveAttribute("aria-sort", "descending");
});

test("mobile catalog presents each server as a compact card", async ({ page }) => {
  const owner = await createAccount(page, "catalog-mobile-card");
  createdEmails.push(owner.email);

  const stamp = Date.now();
  const serverName = `E2E Mobile Card ${stamp}`;
  const description = "Esta descripción sirve para comprobar que el listado móvil prioriza los datos útiles.";
  const server = await createServer(page, {
    name: serverName,
    description,
    javaHost: `mobile-card-${stamp}.example.invalid`,
    tags: ["survival", "community"],
  });
  await markServerVerified(server.slug);
  await publishServer(page, server.slug);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/servers?q=${encodeURIComponent(serverName)}`);

  const row = page.locator("article").filter({ has: page.getByRole("heading", { name: serverName }) });
  await expect(row).toBeVisible();
  await expect(row.getByText(description)).toBeHidden();
  await expect(row).toHaveCSS("border-top-style", "none");
  await expect(row).not.toHaveCSS("border-radius", "0px");
  await expect(row).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const resultsSurface = row.locator("xpath=../..");
  expect(await resultsSurface.evaluate((element) => getComputedStyle(element).boxShadow)).not.toContain("0px 0px 0px 1px");
});

test("a public server page exposes a controlled not-found state", async ({ page }) => {
  await page.goto(`/servers/does-not-exist-${Date.now()}`);
  await expect(page.getByText("Servidor no encontrado", { exact: true })).toBeVisible();
});
