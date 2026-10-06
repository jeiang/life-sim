import { expect, type Page, test } from "@playwright/test";

// The unlock code is held as char codes so the plain text is not in the repo.
const CODE = String.fromCharCode(73, 68, 68, 81, 68);

async function tapVersion(page: Page, times: number): Promise<void> {
  const version = page.getByRole("term").filter({ hasText: "Build version" });
  const button = version.locator("xpath=following-sibling::dd//button");
  for (let i = 0; i < times; i++) await button.click();
}

async function openSettings(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
}

async function unlock(page: Page, code: string): Promise<void> {
  await tapVersion(page, 7);
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Unlock" }).click();
}

test("six taps show no code field, and a wrong code does not unlock", async ({
  page,
}) => {
  await openSettings(page);
  await tapVersion(page, 6);
  await expect(page.getByLabel("Code")).toHaveCount(0);
  await tapVersion(page, 1);
  await expect(page.getByLabel("Code")).toBeVisible();
  await page.getByLabel("Code").fill("letmein");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert")).toHaveText(/not right/);
  await expect(page.getByRole("switch", { name: "God mode" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("switch", { name: "God mode" })).toHaveCount(0);
});

test("unlock, custom life, stat edit survives a reload; switching off hides god mode", async ({
  page,
}) => {
  await openSettings(page);
  await unlock(page, CODE.toLowerCase());
  await expect(page.getByRole("switch", { name: "God mode" })).toBeChecked();

  // Custom life from the life list.
  await page.getByRole("button", { name: "Switch life" }).click();
  await page.getByRole("button", { name: "Custom life" }).click();
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Starting Health (0-100)").fill("33");
  await page.getByLabel(/^Siblings/).fill("3");
  await page.getByRole("button", { name: "Start this life" }).click();
  await expect(
    page.getByRole("img", { name: "Health, 33 percent" }),
  ).toBeVisible();

  // Edit a stat mid-life.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Edit this life" }).click();
  await page.getByLabel("Smarts", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Set Smarts" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("img", { name: "Smarts, 7 percent" }),
  ).toBeVisible();

  // Reload: two lives, the edited one carries a badge and keeps the edit.
  await page.reload();
  const row = page.getByRole("button", { name: /Ada Lovelace/ });
  await expect(row).toContainText("Edited");
  await row.click();
  await expect(
    page.getByRole("img", { name: "Smarts, 7 percent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Health, 33 percent" }),
  ).toBeVisible();

  // Off again: the switch and the custom option disappear.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("switch", { name: "God mode" }).click();
  await expect(page.getByRole("switch", { name: "God mode" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /Ada Lovelace/ }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("switch", { name: "God mode" })).toHaveCount(0);
});
