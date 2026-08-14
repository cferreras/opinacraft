import { expect, test } from "@playwright/test";

test("public server Discord action exposes the Discord brand icon", async ({ page }) => {
  await page.goto("/servers/redstone-republic");

  const discordLink = page.getByRole("link", { name: "Discord", exact: true });
  await expect(discordLink).toBeVisible();
  await expect(discordLink.locator("svg.tabler-icon-brand-discord")).toHaveCount(1);

  const discordColor = await discordLink.locator("svg").evaluate((element) => getComputedStyle(element).color);
  const webColor = await page.getByRole("link", { name: "Web", exact: true }).locator("svg").evaluate((element) => getComputedStyle(element).color);
  expect(discordColor).toBe(webColor);
});
