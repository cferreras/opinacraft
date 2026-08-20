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
  test.setTimeout(90_000);
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
  await expect(page.getByText("Una comunidad de prueba para cubrir el ciclo completo.").first()).toBeVisible();
  const hero = page.getByRole("region", { name: serverName, exact: true });
  await expect(hero.getByText("survival")).toBeVisible();
  await expect(hero.getByText("community")).toBeVisible();
  await expect(page.getByRole("link", { name: "Web del servidor" })).toHaveAttribute("href", "https://example.com/community");
  await expect(page.getByRole("link", { name: "Tienda oficial" })).toHaveAttribute("href", "https://shop.example.com/store");
  const discordLink = page.getByRole("link", { name: "Soporte en Discord" });
  await expect(discordLink).toHaveAttribute("href", "https://discord.gg/example");
  await expect(discordLink.getByTestId("discord-icon")).toHaveCount(1);
  const connection = page.getByRole("complementary", { name: "Conexión y acceso" });
  await expect(connection.getByText("Java", { exact: true })).toBeVisible();
  await expect(connection.getByText("Bedrock", { exact: true })).toBeVisible();

  await page.goto(`/servers/${slug}/manage`);
  const imageFile = {
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await page.getByLabel("Archivo del logo").setInputFiles(imageFile);
  await page.getByRole("button", { name: "Subir logo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Imagen subida/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('img[alt="logo preview"]')).toBeVisible();

  const mediaCard = page.locator('img[alt="logo preview"]').locator("xpath=../..");
  await mediaCard.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Imagen eliminada/i })).toBeVisible();
  await expect(page.locator('img[alt="logo preview"]')).toHaveCount(0);

  await page.locator('textarea[name="description"]').fill("Descripción actualizada desde E2E.");
  await page.locator("#publication-status").selectOption("hidden");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));

  await page.goto("/servers");
  await expect(page.getByText(serverName)).toHaveCount(0);

  await page.goto(`/servers/${slug}/manage`);
  await page.locator("#publication-status").selectOption("published");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?updated=1$`));
  await expect(page.getByText("Se guardaron los datos del servidor.")).toBeVisible();

  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.locator('input[name="confirmation"]')).toBeVisible();
  await page.locator('input[name="confirmation"]').fill("DELETE");
  await page.getByRole("button", { name: "Eliminar permanentemente" }).click();
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
  await expect(page.getByRole("alert").filter({ hasText: /PNG|JPEG|WebP/i })).toBeVisible();
});
