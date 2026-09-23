import { test, expect } from "@playwright/test";

test("mobile footer keeps its content groups readable", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");

  const footer = page.locator("footer");
  await expect(footer).toBeVisible();

  // Two columns of link groups on a phone: Explorar and Comunidad share a row, Recursos and Legal the next.
  const groups = footer.getByRole("navigation");
  await expect(groups).toHaveCount(4);

  const groupRects = await groups.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), right: Math.round(rect.right) };
    }),
  );

  expect(new Set(groupRects.map(({ top }) => top)).size).toBe(2);

  const footerBounds = await footer.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(footerBounds.scrollWidth).toBeLessThanOrEqual(footerBounds.clientWidth);
  expect(groupRects.every(({ right }) => right <= footerBounds.clientWidth)).toBe(true);

  const legalNavigation = footer.getByRole("navigation", { name: "Legal" });
  await expect(legalNavigation).toBeVisible();
  await expect(legalNavigation.getByRole("link", { name: /Privacidad/ })).toBeVisible();
  await expect(footer.getByRole("group", { name: "Tema" })).toBeVisible();
});

test("all app pages expose the full site footer exactly once", async ({ page }) => {
  for (const path of ["/sign-in", "/forgot-password", "/terms", "/dashboard/servers"]) {
    await page.goto(path);

    const footer = page.locator("footer");
    await expect(footer, `footer on ${path}`).toHaveCount(1);
    await expect(footer.getByRole("navigation"), `full footer on ${path}`).toHaveCount(4);
    await expect(footer.getByRole("navigation", { name: "Explorar" })).toBeVisible();
  }
});

test("does not add a second viewport before the shared footer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });

  for (const path of ["/contact", "/sign-in"]) {
    await page.goto(path);

    const bounds = await page.locator("footer").evaluate((footer) => {
      const rect = footer.getBoundingClientRect();
      return {
        footerTop: Math.round(rect.top),
        footerBottom: Math.round(rect.bottom + window.scrollY),
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });

    // The footer is taller than the room a short page leaves, so it may run past the fold -- but it
    // has to start on the first screen, and nothing may pad the page before or after it.
    expect(bounds.footerTop, `footer should start on the first screen of ${path}`).toBeLessThan(bounds.viewportHeight);
    expect(bounds.documentHeight, `page should end with the footer on ${path}`).toBe(bounds.footerBottom);
  }
});

test("does not stream the footer before async route content", async ({ page }) => {
  await page.goto("/sign-in");

  const firstChunk = await page.evaluate(async () => {
    const response = await fetch("/admin");
    const reader = response.body?.getReader();
    const chunk = await reader?.read();

    await reader?.cancel();
    return new TextDecoder().decode(chunk?.value);
  });

  expect(firstChunk).not.toContain("<footer");
});

test("the footer switches the site theme and remembers it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/sign-in");

  const themeSwitch = page.locator("footer").getByRole("group", { name: "Tema" });
  await themeSwitch.getByRole("button", { name: "Oscuro" }).click();

  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(themeSwitch.getByRole("button", { name: "Oscuro" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator("footer").getByRole("group", { name: "Tema" }).getByRole("button", { name: "Oscuro" })).toHaveAttribute("aria-pressed", "true");

  await page.locator("footer").getByRole("group", { name: "Tema" }).getByRole("button", { name: "Claro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});
