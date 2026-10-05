import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const ageButton = (page: Page) =>
  page.getByRole("button", { name: "Age", exact: true });

/** Click a pending choice until the dialog closes. */
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

test("ages up ten times, resolving every pending choice", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^Age 0 years/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Health, \d+ percent$/ }),
  ).toBeVisible();

  let years = 0;
  for (let i = 0; i < 10; i++) {
    if (await ageButton(page).isDisabled()) break; // the life ended
    await ageButton(page).click();
    years++;
    await resolvePending(page);
  }
  expect(years).toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: new RegExp(`^Age ${years} year`, "i") }),
  ).toBeVisible();
  // The newest year is scrolled into view.
  await expect(
    page.getByRole("heading", { name: new RegExp(`^Age ${years} year`, "i") }),
  ).toBeInViewport();
});

test("Age is disabled while a choice is open and menus open a page with Back", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(ageButton(page)).toBeEnabled();
  await page.getByRole("button", { name: "Activities" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  for (let i = 0; i < 40; i++) {
    if (await ageButton(page).isDisabled()) break;
    await ageButton(page).click();
    if (await page.getByRole("dialog").isVisible()) {
      await expect(ageButton(page)).toBeDisabled();
      await resolvePending(page);
      return;
    }
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`no axe violations on the main layout (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(ageButton(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("touch targets are at least 44px and layout survives 200% text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  for (const name of [
    "Occupation",
    "Assets",
    "Relationships",
    "Activities",
    "Settings",
  ]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.addStyleTag({ content: "html{font-size:200%}" });
  // Nothing overflows sideways and every control is still reachable and works.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const name of ["Occupation", "Assets", "Relationships", "Activities"]) {
    await page.getByRole("button", { name }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name })).toBeInViewport({
      ratio: 1,
    });
  }
  await ageButton(page).scrollIntoViewIfNeeded();
  await expect(ageButton(page)).toBeInViewport({ ratio: 1 });
  await ageButton(page).click();
  await resolvePending(page);
  await expect(
    page.getByRole("heading", { name: /^Age 1 year/i }),
  ).toBeAttached();
});
