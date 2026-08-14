import { expect, test } from "@playwright/test";

for (const route of ["/sign-in", "/sign-up"] as const) {
  test(`${route} exposes the Discord brand icon on social sign-in`, async ({ page }) => {
    await page.goto(route);

    const discordButton = page.getByRole("button", { name: "Continuar con Discord" });
    await expect(discordButton).toBeVisible();
    await expect(discordButton.locator("svg")).toHaveCount(1);
    await expect(discordButton.locator("svg")).toHaveAttribute("aria-hidden", "true");

    const backgroundAlpha = await discordButton.evaluate((element) => {
      const match = getComputedStyle(element).backgroundColor.match(/\/\s*([\d.]+)\)$/);
      return match ? Number(match[1]) : 1;
    });
    expect(backgroundAlpha).toBeGreaterThanOrEqual(0.1);
  });
}

for (const { route, primaryLabel } of [
  { route: "/sign-in", primaryLabel: "Iniciar sesión" },
  { route: "/sign-up", primaryLabel: "Crear cuenta" },
] as const) {
  test(`${route} gives its wide auth actions a comfortable height`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);

    const actionHeights = await Promise.all(
      [primaryLabel, "Continuar con Discord"].map((label) =>
        page.getByRole("button", { name: label }).evaluate((element) => element.getBoundingClientRect().height),
      ),
    );

    expect(actionHeights.every((height) => height >= 40)).toBe(true);
  });
}

for (const route of ["/sign-in", "/sign-up"] as const) {
  test(`${route} keeps fields and actions on the same comfortable rhythm`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);

    const controlHeights = await page.locator("form input, form button").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );

    expect(controlHeights.every((height) => height >= 40)).toBe(true);
  });
}
