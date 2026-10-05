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
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
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

test("profile and net-worth chart open, describe the data, and pass axe", async ({
  page,
}) => {
  await page.goto("/");
  for (let i = 0; i < 5; i++) {
    if (await ageButton(page).isDisabled()) break;
    await ageButton(page).click();
    await resolvePending(page);
  }
  await page.getByRole("button", { name: "Your profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await expect(page.getByTestId("net-worth")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Health, \d+ percent$/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Net worth chart" }).click();
  await expect(page.getByTestId("chart")).toBeVisible();
  await expect(page.getByTestId("chart-summary")).toContainText("Started at");
  await page.getByRole("button", { name: "Show data table" }).click();
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  }
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(ageButton(page)).toBeVisible();
});

type LifeHook = {
  startChain3(): void;
  openPurchase(id: string): void;
  setMoney(n: number): void;
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
          __life: Record<string, (...x: unknown[]) => void>;
        }
      ).__life[n as string]?.(...(a as unknown[])),
    [name, args] as const,
  );

test("a 3-step next: chain completes in one modal with earlier outcomes shown above", async ({
  page,
}) => {
  await page.goto("/");
  await hook(page, "startChain3");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Chain step 1");
  await expect(dialog.locator("ul")).toHaveCount(0);
  const choose = () =>
    dialog.getByRole("button").and(page.locator(":enabled")).first().click();
  await choose();
  await expect(dialog).toContainText("Chain step 2");
  await expect(dialog.locator("li")).not.toHaveCount(0);
  const afterFirst = await dialog.locator("li").count();
  await choose();
  await expect(dialog).toContainText("Chain step 3");
  expect(await dialog.locator("li").count()).toBeGreaterThan(afterFirst);
  // The chain is still one dialog, and Escape does not dismiss a pending event.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await choose();
  await expect(dialog).toBeHidden();
});

test("purchase dialog reflects affordability and loan terms, traps focus, returns focus", async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).focus();
  await hook(page, "setMoney", 0);
  await hook(page, "openPurchase", "core-loop/studio-condo");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Studio condo");
  await expect(dialog.getByRole("button", { name: "Pay cash" })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Take loan" }),
  ).toBeDisabled();
  await expect(dialog).toContainText("Down payment");
  await expect(dialog).toContainText("a year");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Focus stays inside the dialog (WebKit does not Tab to buttons by default).
  for (let i = 0; i < (browserName === "webkit" ? 0 : 4); i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();

  // Enough for the 20% down payment but not the whole price.
  await hook(page, "setMoney", 5_000_000);
  await hook(page, "openPurchase", "core-loop/studio-condo");
  await expect(dialog.getByRole("button", { name: "Pay cash" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Take loan" })).toBeEnabled();
  await page.keyboard.press("Escape");

  // An item with no loan kind never offers one.
  await hook(page, "setMoney", 20_000_000);
  await hook(page, "openPurchase", "core-loop/used-bike");
  await expect(dialog.getByRole("button", { name: "Pay cash" })).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Take loan" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  await hook(page, "openPurchase", "core-loop/studio-condo");
  await expect(dialog.getByRole("button", { name: "Pay cash" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Take loan" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Take loan" }).click();
  await expect(dialog).toBeHidden();
});

test("amount picker clamps to min/max/step and confirms or cancels", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const picked = () =>
    page.evaluate(
      () => (window as unknown as { __picked?: number | null }).__picked,
    );
  const open = () =>
    page.evaluate(() =>
      (
        window as unknown as { __life: { pickAmount(...a: number[]): void } }
      ).__life.pickAmount(10, 100, 5),
    );
  const dialog = page.getByRole("dialog");
  await open();
  const input = dialog.getByRole("spinbutton");
  await expect(input).toBeFocused();
  await input.fill("47");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  expect(await picked()).toBe(45);
  await open();
  await dialog.getByRole("spinbutton").fill("5000");
  await dialog.getByRole("spinbutton").press("Enter");
  expect(await picked()).toBe(100);
  await open();
  await expect(dialog.getByRole("spinbutton")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await picked()).toBeNull();
});
