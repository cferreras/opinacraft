import { expect, test } from "@playwright/test";

test("homepage publishing CTA keeps a comfortable touch height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const publishLink = page.getByRole("link", { name: "Publicar servidor →" });
  await expect(publishLink).toBeVisible();

  const height = await publishLink.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(40);
});

for (const route of ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/change-password"] as const) {
  test(`${route} keeps its form controls on the comfortable rhythm`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);

    const controlHeights = await page.locator("form input:not([type=hidden]), form button").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );

    expect(controlHeights.length).toBeGreaterThan(0);
    expect(controlHeights.every((height) => height >= 40)).toBe(true);
  });
}
