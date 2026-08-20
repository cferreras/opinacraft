import { expect, test } from "@playwright/test";

import { cleanupAccounts, createAccount, createServer, markServerVerified, publishServer } from "./helpers";

const createdEmails: string[] = [];
let serverSlug: string;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const setupPage = await context.newPage();
  const owner = await createAccount(setupPage, "server-utility-owner");
  createdEmails.push(owner.email);

  const server = await createServer(setupPage, {
    name: "Redstone Republic",
    javaHost: `redstone-republic-${Date.now()}.example.invalid`,
    websiteUrl: "https://redstone.example",
    discordUrl: "https://discord.example/redstone",
  });
  await markServerVerified(server.slug);
  await publishServer(setupPage, server.slug);
  serverSlug = server.slug;
  await context.close();
});

test.afterAll(async () => {
  await cleanupAccounts(createdEmails);
});

test("public server Discord action exposes the Discord brand icon", async ({ page }) => {
  await page.goto(`/servers/${serverSlug}`);

  const discordLink = page.getByRole("link", { name: "Soporte en Discord" });
  await expect(discordLink).toBeVisible();
  await expect(discordLink.getByTestId("discord-icon")).toHaveCount(1);

  const discordColor = await discordLink.locator("svg").first().evaluate((element) => getComputedStyle(element).color);
  const webColor = await page
    .getByRole("link", { name: "Web del servidor" })
    .locator("svg")
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  expect(discordColor).toBe(webColor);
});

test("public server keeps share and report next to the connection details", async ({ page }) => {
  await page.goto(`/servers/${serverSlug}`);

  await expect(page.getByRole("button", { name: "Compartir" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reportar" })).toBeVisible();
});
