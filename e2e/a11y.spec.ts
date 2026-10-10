import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/** One axe pass per screen kind and app screen, in both themes (docs/spec/visual.md#accessibility-wcag-22-aa). */
const call = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(
    ([n, a]) =>
      (
        window as unknown as {
          __life: Record<string, (...x: unknown[]) => void>;
        }
      ).__life[n as string]?.(...(a as unknown[])),
    [name, args] as const,
  );

async function expectClean(page: Page, what: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
    what,
  ).toEqual([]);
}

/** Click the first enabled choice until no dialog is open. */
async function resolvePending(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 20 && (await dialog.isVisible()); i++)
    await dialog
      .getByRole("button")
      .and(page.locator(":enabled"))
      .first()
      .click();
  await expect(dialog).toBeHidden();
}

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto("/");
      await expect(button(page, "Age")).toBeVisible();
    });

    test("feed and stat panel, menu lists, profile, chart", async ({
      page,
    }) => {
      await expectClean(page, "main layout");
      for (const top of [
        "Occupation",
        "Assets",
        "Relationships",
        "Activities",
      ]) {
        await page
          .getByRole("navigation", { name: "Menus" })
          .getByRole("button", { name: top })
          .click();
        await expectClean(page, `menu ${top}`);
        if (top === "Assets") {
          await button(page, "Shopping").click();
          await expectClean(page, "assets/shopping");
          await button(page, "Back").click();
        }
        await button(page, "Back").click();
      }
      await button(page, "Age").click();
      await resolvePending(page);
      await button(page, "Your profile").click();
      await expectClean(page, "profile");
      await button(page, "Net worth chart").click();
      await expectClean(page, "chart");
      await button(page, "Show data table").click();
      await expectClean(page, "chart data table");
    });

    test("choice, purchase, and amount dialogs", async ({ page }) => {
      await call(page, "startChain3");
      await expect(page.getByRole("dialog")).toContainText("Chain step 1");
      await expectClean(page, "choice dialog");
      await resolvePending(page);
      await call(page, "setMoney", 5_000_000);
      await call(page, "openPurchase", "core-loop/studio-condo");
      await expect(page.getByRole("dialog")).toContainText("Studio condo");
      await expectClean(page, "purchase dialog");
      await page.keyboard.press("Escape");
      await call(page, "pickAmount", 10, 100, 5);
      await expect(page.getByRole("spinbutton")).toBeFocused();
      await expectClean(page, "amount picker");
    });

    test("settings, credits, life list, obituary, graveyard", async ({
      page,
    }) => {
      await button(page, "Settings").click();
      await expectClean(page, "settings");
      await button(page, "Credits").click();
      await expectClean(page, "credits");
      await button(page, "Back").click();
      await button(page, "Switch life").click();
      await expect(
        page.getByRole("heading", { name: "Your lives" }),
      ).toBeVisible();
      await expectClean(page, "life list");
      await button(page, "Start a new life").click();
      await expect(button(page, "Age")).toBeVisible();
      await call(page, "addChild", 10);
      await call(page, "die");
      await expect(
        page.getByRole("heading", { name: "Obituary" }),
      ).toBeVisible();
      await expectClean(page, "obituary");
      await button(page, "Finish this life").click();
      await button(page, "Graveyard").click();
      await expect(page.getByRole("list").getByRole("button")).toHaveCount(1);
      await expectClean(page, "graveyard");
    });
  });
}
