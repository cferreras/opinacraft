import { test, expect } from "@playwright/test";

test("mobile footer keeps its content groups readable", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");

  const footer = page.locator("footer");
  await expect(footer).toBeVisible();

  const groups = footer.getByRole("navigation");
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

  const helpNavigation = footer.getByRole("navigation", { name: "Ayuda" });
  await expect(helpNavigation).toBeVisible();
  await expect(helpNavigation.getByRole("link", { name: /Privacidad/ })).toBeVisible();
});

test("all app pages expose the full site footer exactly once", async ({ page }) => {
  for (const path of ["/sign-in", "/forgot-password", "/terms", "/dashboard/servers"]) {
    await page.goto(path);

    const footer = page.locator("footer");
    await expect(footer, `footer on ${path}`).toHaveCount(1);
    await expect(footer.getByRole("navigation"), `full footer on ${path}`).toHaveCount(3);
    await expect(footer.getByRole("navigation", { name: "Explorar" })).toBeVisible();
  }
});
