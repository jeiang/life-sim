import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const ageButton = (page: Page) =>
  page.getByRole("button", { name: "Age", exact: true });

async function resolvePending(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 20 && (await dialog.isVisible()); i++) {
    await dialog
      .getByRole("button")
      .and(page.locator(":enabled"))
      .first()
      .click();
  }
  await expect(dialog).toBeHidden();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function switchLife(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByRole("button", { name: "Switch life" }).click();
  await expect(page.getByRole("heading", { name: "Your lives" })).toBeVisible();
}

const lifeButtons = (page: Page) => page.getByRole("list").getByRole("button");

test("a new life is added to the list and the old one stays", async ({
  page,
}) => {
  await page.goto("/");
  await expect(ageButton(page)).toBeVisible();
  await ageButton(page).click();
  await resolvePending(page);
  await switchLife(page);
  await expect(lifeButtons(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Start a new life" }).click();
  await expect(ageButton(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^Age 0 years/i }),
  ).toBeVisible();
  await switchLife(page);
  await expect(lifeButtons(page)).toHaveCount(2);
  // The aged life continues where it left off.
  await page.getByRole("list").getByRole("button", { name: /Age 1/ }).click();
  await expect(
    page.getByRole("heading", { name: /^Age 1 year/i }),
  ).toBeVisible();
});

test("lives survive a reload", async ({ page }) => {
  await page.goto("/");
  await ageButton(page).click();
  await resolvePending(page);
  // autosave is queued; wait for the store to settle before reloading
  await page.waitForTimeout(500);
  await page.reload();
  // One life: continued directly.
  await expect(
    page.getByRole("heading", { name: /^Age 1 year/i }),
  ).toBeVisible();
});

test("export downloads a file; import round-trips into a fresh browser profile", async ({
  page,
  browser,
}) => {
  // WebKit offers a share sheet that never answers in automation; exercise the download path.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: undefined });
  });
  await page.goto("/");
  await ageButton(page).click();
  await resolvePending(page);
  await openSettings(page);
  const exportButton = page.getByRole("button", { name: "Export lives" });
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^life-sim-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await download.path();
  const saved = JSON.parse(await readFile(path, "utf8"));
  expect(saved.lives).toHaveLength(1);

  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto("/");
  await expect(ageButton(other)).toBeVisible();
  await openSettings(other);
  await other.locator('input[type="file"]').setInputFiles(path);
  await expect(
    other.getByRole("status").filter({ hasText: "Imported" }),
  ).toBeVisible();
  await other.getByRole("button", { name: "Switch life" }).click();
  // The fresh profile's own first life plus the imported one.
  await expect(lifeButtons(other)).toHaveCount(2);
  await expect(
    other.getByRole("list").getByRole("button", { name: /Age 1/ }),
  ).toBeVisible();
  await fresh.close();
});

test("import shows validation errors", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("this is not a save"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: /./ }).first(),
  ).toBeVisible();
});

test("credits list every icon source and license", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "Credits" }).click();
  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  for (const name of ["Twemoji", "Lucide", "Feather"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await expect(page.getByText("CC BY 4.0").first()).toBeAttached();
  await expect(page.getByText(/ISC/).first()).toBeAttached();
  await expect(page.getByText("MIT").first()).toBeAttached();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

type LifeHook = {
  die(): void;
  addChild(age: number): void;
  flushSaves(): Promise<void>;
};
const hook = <K extends keyof LifeHook>(
  page: Page,
  name: K,
  ...args: Parameters<LifeHook[K]>
) =>
  page.evaluate(
    ([n, a]) =>
      (
        window as unknown as {
          __life: Record<string, (...x: unknown[]) => unknown>;
        }
      ).__life[n as string]?.(...(a as unknown[])),
    [name, args] as const,
  );

test("with no living child the line ends: finishing moves the life to the graveyard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(ageButton(page)).toBeVisible();
  await hook(page, "die");
  await expect(page.getByRole("heading", { name: "Obituary" })).toBeVisible();
  await expect(page.getByText("Age at death")).toBeVisible();
  await expect(page.getByText("Net worth")).toBeVisible();
  await expect(page.getByText(/No living child can carry on/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose an heir" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Finish this life" }).click();
  await expect(page.getByRole("heading", { name: "Your lives" })).toBeVisible();
  await expect(page.getByText("No life in progress.")).toBeVisible();
  await page.getByRole("button", { name: "Graveyard" }).click();
  await expect(lifeButtons(page)).toHaveCount(1);
  await lifeButtons(page).first().click();
  await expect(page.getByText("Age at death")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
});

test("a dead life stays listed until the player chooses; reload mid-choice keeps it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(ageButton(page)).toBeVisible();
  await hook(page, "addChild", 12);
  await hook(page, "die");
  await expect(page.getByRole("heading", { name: "Obituary" })).toBeVisible();
  await hook(page, "flushSaves");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Obituary" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue as Kid Heir, age 12/ }),
  ).toBeVisible();
  // Not in the graveyard yet.
  await page.getByRole("button", { name: "Back to your lives" }).click();
  await expect(page.getByText(/Died at age .*choose an heir/)).toBeVisible();
  await page.getByRole("button", { name: "Graveyard" }).click();
  await expect(page.getByText("No one has died yet.")).toBeVisible();
});

test("die, pick an heir, continue, die again: two graveyard entries in one family", async ({
  page,
}) => {
  await page.goto("/");
  await expect(ageButton(page)).toBeVisible();
  await hook(page, "addChild", 12);
  await hook(page, "die");
  await page.getByRole("button", { name: /Continue as Kid Heir/ }).click();
  // The heir plays on: the game screen is back and the age button works.
  await expect(ageButton(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Obituary" })).toHaveCount(0);
  await hook(page, "die");
  await expect(page.getByRole("heading", { name: "Obituary" })).toBeVisible();
  await expect(page.getByText(/No living child can carry on/)).toBeVisible();
  await page.getByRole("button", { name: "Finish this life" }).click();
  await page.getByRole("button", { name: "Graveyard" }).click();
  await expect(lifeButtons(page)).toHaveCount(2);
  await expect(page.getByText(/Generation 1\./)).toBeVisible();
  await expect(page.getByText(/Generation 2\./)).toBeVisible();
  await expect(page.getByRole("region", { name: /family$/ })).toHaveCount(1);
  await lifeButtons(page).nth(1).click();
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
  await expect(page.getByText(/carries on after/)).toBeVisible();
});
