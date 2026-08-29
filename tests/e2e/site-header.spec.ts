import { expect, test } from "@playwright/test";

test("keeps the wordmark text vertically aligned with the primary navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const brandText = page.locator('header a[aria-label="OpinaCraft, inicio"] span span');
  const primaryNavigation = page.getByRole("navigation", { name: "Navegación principal" });
  const homeLink = primaryNavigation.getByRole("link", { name: "Mis servidores" });
  await expect(primaryNavigation.getByRole("link", { name: "Servidores" })).toHaveCount(0);
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

test("uses the system color scheme when no theme preference is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveClass(/dark/);
});
