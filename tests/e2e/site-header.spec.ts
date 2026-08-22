import { expect, test } from "@playwright/test";

test("keeps the wordmark text vertically aligned with the primary navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const brandText = page.locator('header a[aria-label="OpinaCraft, inicio"] span span');
  const homeLink = page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inicio" });
  const [brandCenter, homeCenter] = await Promise.all([
    brandText.evaluate((element) => {
      const { top, height } = element.getBoundingClientRect();
      return top + height / 2;
    }),
    homeLink.evaluate((element) => {
      const { top, height } = element.getBoundingClientRect();
      return top + height / 2;
    }),
  ]);

  expect(Math.abs(brandCenter - homeCenter)).toBeLessThanOrEqual(1);
});
