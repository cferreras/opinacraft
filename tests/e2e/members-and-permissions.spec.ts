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

test("owner can add, promote and remove a member while permissions stay scoped", async ({ page, browser }) => {
  const owner = await createAccount(page, "member-owner");
  createdEmails.push(owner.email);
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  const memberAccount = await createAccount(member, "member-user");
  createdEmails.push(memberAccount.email);

  const { slug } = await createServer(page, {
    name: `E2E Members ${Date.now()}`,
    javaHost: `members-${Date.now()}.example.invalid`,
  });
  await markServerVerified(slug);
  await publishServer(page, slug);

  await page.goto(`/servers/${slug}/manage`);
  const membersPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Members", exact: true }) });
  const addMemberForm = membersPanel.locator("form").filter({ has: page.getByRole("button", { name: "Add" }) });
  await addMemberForm.locator('input[name="email"]').fill(memberAccount.email);
  await addMemberForm.locator('select[name="role"]').selectOption("editor");
  await addMemberForm.getByRole("button", { name: "Add" }).click();
  await expect(membersPanel.getByText(memberAccount.email)).toBeVisible();

  await member.goto(`/servers/${slug}/manage`);
  await expect(member.getByText(/Role:\s*editor/i)).toBeVisible();
  await expect(member.getByLabel("Publication")).toBeDisabled();
  await expect(member.getByRole("heading", { name: "Members", exact: true })).toHaveCount(0);
  await expect(member.getByText("Delete server")).toHaveCount(0);

  await page.goto(`/servers/${slug}/manage`);
  const memberRow = membersPanel.locator("div.rounded-xl.border").filter({ hasText: memberAccount.email });
  await memberRow.locator('select[name="role"]').selectOption("admin");
  await memberRow.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?memberUpdated=1$`));

  await member.goto(`/servers/${slug}/manage`);
  await expect(member.getByText(/Role:\s*admin/i)).toBeVisible();
  await expect(member.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
  await expect(member.getByRole("button", { name: "Add" })).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(member.getByLabel("Publication")).toBeDisabled();

  await member.goto(`/servers/${slug}`);
  await expect(member.getByText(/miembros no pueden puntuar/i)).toBeVisible();

  await page.goto(`/servers/${slug}/manage`);
  await memberRow.getByRole("button", { name: "Remove" }).click();
  await expect(page).toHaveURL(new RegExp(`/servers/${slug}/manage\\?memberUpdated=1$`));
  await member.goto(`/servers/${slug}/manage`);
  await expect(member.getByText(/not found|no encontrado/i)).toBeVisible();

  await memberContext.close();
});
