import { test, expect } from "@playwright/test";

test("mobile footer keeps its three content groups readable", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");

  const footer = page.locator("footer");
  await expect(footer).toBeVisible();

  const groups = footer.locator(":scope > div > *");
  await expect(groups).toHaveCount(3);

  const groupRects = await groups.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), right: Math.round(rect.right) };
    }),
  );

  expect(new Set(groupRects.map(({ top }) => top)).size).toBe(3);

  const footerBounds = await footer.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(footerBounds.scrollWidth).toBeLessThanOrEqual(footerBounds.clientWidth);
  expect(groupRects.every(({ right }) => right <= footerBounds.clientWidth)).toBe(true);

  const legalNavigation = footer.getByRole("navigation", { name: "Enlaces legales" });
  await expect(legalNavigation).toBeVisible();
  await expect(legalNavigation.getByRole("link", { name: /Privacidad/ })).toBeVisible();
});
