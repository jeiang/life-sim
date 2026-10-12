import { expect, type Page, test } from "@playwright/test";

// Throwaway code whose bcrypt hash the e2e build gets (playwright.config.ts).
const CODE = "e2e-throwaway-code";

// The e2e-only test hook (store.ts, under VITE_E2E).
type PersonInfo = { givenName: string; familyName: string; gender: string };
declare global {
  interface Window {
    __life: {
      spawnChild(): string | null;
      lastChild(): number | null;
      personInfo(id: number): PersonInfo | null;
      flushSaves(): Promise<void>;
    };
  }
}

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

test("god mode asks a child's sex; the reload keeps the same child", async ({
  page,
}) => {
  await openSettings(page);
  await unlock(page, CODE);
  await page.getByRole("switch", { name: "God mode" }).click();
  await expect(page.getByRole("switch", { name: "God mode" })).toBeChecked();

  // Custom life from the life list.
  await page.getByRole("button", { name: "Switch life" }).click();
  await page.getByRole("button", { name: "Custom life" }).click();
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByRole("button", { name: "Start this life" }).click();
  await expect(
    page.getByRole("button", { name: "Age", exact: true }),
  ).toBeVisible();

  // Spawn a child: god mode parks the draws in the question dialog.
  const error = await page.evaluate(() => window.__life.spawnChild());
  expect(error).toBeNull();
  const sex = page.getByRole("combobox", { name: "Sex", exact: true });
  await expect(sex).toBeVisible();

  // Sex = female is staged alone; the rest come back, then roll the rest.
  const female = await sex
    .locator("option", { hasText: /^female/ })
    .getAttribute("value");
  expect(female, "the sex row offers female").not.toBeNull();
  await sex.selectOption(female ?? "");
  for (let i = 0; i < 5; i++) {
    const roll = page.getByRole("button", { name: "Roll the rest" });
    if ((await roll.count()) === 0) break;
    await roll.click();
  }
  await expect(page.getByRole("button", { name: "Roll the rest" })).toHaveCount(
    0,
  );

  const child = await page.evaluate(() => window.__life.lastChild());
  expect(child).not.toBeNull();
  const before = await page.evaluate(
    (id) => window.__life.personInfo(id),
    child ?? -1,
  );
  expect(before?.gender).toBe("female");

  // Reload: the saved life replays to the same child with the same sex.
  await page.evaluate(() => window.__life.flushSaves());
  await page.reload();
  await page.getByRole("button", { name: /Ada Lovelace/ }).click();
  await expect(
    page.getByRole("button", { name: "Age", exact: true }),
  ).toBeVisible();
  const after = await page.evaluate(
    (id) => window.__life.personInfo(id),
    child ?? -1,
  );
  expect(after).toEqual(before);
});
