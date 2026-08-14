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

  const discordLink = page.getByRole("link", { name: "Discord", exact: true });
  await expect(discordLink).toBeVisible();
  await expect(discordLink.locator("svg.tabler-icon-brand-discord")).toHaveCount(1);

  const discordColor = await discordLink.locator("svg").evaluate((element) => getComputedStyle(element).color);
  const webColor = await page.getByRole("link", { name: "Web", exact: true }).locator("svg").evaluate((element) => getComputedStyle(element).color);
  expect(discordColor).toBe(webColor);
});
