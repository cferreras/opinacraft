import { expect, test } from "@playwright/test";

import {
  cleanupAccounts,
  createAccount,
  createServer,
  markServerVerified,
  publishServer,
} from "./helpers";

const createdEmails: string[] = [];

test.afterAll(async () => {
  await cleanupAccounts(createdEmails);
});

test("owner can create a complete Java/Bedrock listing, upload media, edit visibility and delete it", async ({ page }) => {
  const owner = await createAccount(page, "server-lifecycle");
  createdEmails.push(owner.email);

  const serverName = `E2E Complete Server ${Date.now()}`;
  const { slug } = await createServer(page, {
    name: serverName,
    javaHost: `java-${Date.now()}.example.invalid`,
    bedrockHost: `bedrock-${Date.now()}.example.invalid`,
    description: "Una comunidad de prueba para cubrir el ciclo completo.",
    websiteUrl: "https://example.com/community",
    storeUrl: "https://shop.example.com/store",
    discordUrl: "https://discord.gg/example",
    tags: ["survival", "community"],
  });
  await markServerVerified(slug, ["java", "bedrock"]);
  await publishServer(page, slug);

  await page.goto(`/servers/${slug}`);
  await expect(page.getByRole("heading", { name: serverName })).toBeVisible();
  await expect(page.getByText("Una comunidad de prueba para cubrir el ciclo completo.")).toBeVisible();
  await expect(page.getByText("survival")).toBeVisible();
  await expect(page.getByText("community")).toBeVisible();
  await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://example.com/community");
  await expect(page.getByRole("link", { name: "Tienda oficial" })).toHaveAttribute("href", "https://shop.example.com/store");
  await expect(page.getByRole("link", { name: "Discord" })).toHaveAttribute("href", "https://discord.gg/example");
  await expect(page.getByText("java", { exact: true })).toBeVisible();
  await expect(page.getByText("bedrock", { exact: true })).toBeVisible();

  await page.goto(`/servers/${slug}/manage`);
  const imageFile = {
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await page.locator('select[name="kind"]').selectOption("logo");
  await page.locator('input[type="file"]').setInputFiles(imageFile);
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Imagen subida/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('img[alt="logo"]')).toBeVisible();

  const mediaCard = page.locator('img[alt="logo"]').locator("xpath=..");
  await mediaCard.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Imagen eliminada/i })).toBeVisible();
  await expect(page.locator('img[alt="logo"]')).toHaveCount(0);

  await page.locator('textarea[name="description"]').fill("Descripción actualizada desde E2E.");
  await page.getByLabel("Publication").selectOption("hidden");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));

  await page.goto("/servers");
  await expect(page.getByText(serverName)).toHaveCount(0);

  await page.goto(`/servers/${slug}/manage`);
  await page.getByLabel("Publication").selectOption("published");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));
  await expect(page.getByText("Server details saved.")).toBeVisible();

  await page.locator("summary").filter({ hasText: "Delete server" }).click();
  await expect(page.locator('input[name="confirmation"]')).toBeVisible();
  await page.locator('input[name="confirmation"]').fill("DELETE");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/dashboard\/servers\?deleted=1$/);
  await expect(page.getByText(serverName)).toHaveCount(0);
});

test("a non-image media file is rejected", async ({ page }) => {
  const owner = await createAccount(page, "media-validation");
  createdEmails.push(owner.email);
  const { slug } = await createServer(page, { name: `E2E Media Validation ${Date.now()}` });

  await page.goto(`/servers/${slug}/manage`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("button", { name: "Subir" }).click();
  await expect(page.getByRole("status").filter({ hasText: /PNG|JPEG|WebP/i })).toBeVisible();
});
