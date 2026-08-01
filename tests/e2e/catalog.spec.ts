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

  await page.getByLabel("Buscar").fill("Alpha");
  await page.getByLabel("Edición").selectOption("bedrock");
  await page.getByRole("button", { name: "Filtrar" }).click();
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

test("a public server page exposes a controlled not-found state", async ({ page }) => {
  await page.goto(`/servers/does-not-exist-${Date.now()}`);
  await expect(page.getByRole("heading", { name: /not found|no encontrado/i })).toBeVisible();
});
