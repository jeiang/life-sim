import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { compilePacks } from "../packages/pack-tools/src/index.ts";

const compiled = compilePacks(new URL("../packs", import.meta.url).pathname);
if (!compiled.ok) throw new Error("packs failed to compile");

interface ActionDecl {
  id: string;
  menu: string;
  scope?: string;
  label?: string;
}
const actions: ActionDecl[] = compiled.bundles
  .flatMap(
    (b) => b.storylets as unknown as (ActionDecl & { trigger: string })[],
  )
  .filter((s) => s.trigger === "action" && s.menu);

/** Mirrors the Core's default row label for an action without a declared label. */
const rowLabel = (a: ActionDecl): string => {
  if (a.label) return a.label;
  const short = (a.id.split("/").pop() ?? a.id).replaceAll(/[-_]+/g, " ");
  return short.charAt(0).toUpperCase() + short.slice(1);
};
const submenuTitle = (path: string): string => {
  const short = (path.split("/").pop() ?? path).replaceAll(/[-_]+/g, " ");
  return short.charAt(0).toUpperCase() + short.slice(1);
};
const TOP: Record<string, string> = {
  occupation: "Occupation",
  assets: "Assets",
  relationships: "Relationships",
  activities: "Activities",
};

async function openMenu(page: Page, menu: string): Promise<void> {
  const [top, subPath] = menu.split("/");
  await page
    .getByRole("navigation", { name: "Menus" })
    .getByRole("button", {
      name: TOP[top as string] as string,
    })
    .click();
  if (subPath)
    await page.getByRole("button", { name: submenuTitle(menu) }).click();
}

test("every non-person action is reachable from its declared menu", async ({
  page,
}) => {
  const own = actions.filter((a) => a.scope === undefined);
  expect(own.length).toBeGreaterThan(0);
  await page.goto("/");
  const menus = [...new Set(own.map((a) => a.menu))];
  for (const menu of menus) {
    await openMenu(page, menu);
    for (const a of own.filter((x) => x.menu === menu)) {
      await expect(
        page.getByRole("button", { name: rowLabel(a) }).first(),
        `${a.id} in ${menu}`,
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Back" }).click();
    if (menu.includes("/"))
      await page.getByRole("button", { name: "Back" }).click();
  }
});

test("locked rows stay visible with their reason, announced to screen readers", async ({
  page,
}) => {
  await page.goto("/");
  await openMenu(page, "activities");
  const locked = page.locator('button[aria-disabled="true"]').first();
  await expect(locked).toBeVisible();
  await expect(locked).toContainText("Locked:");
  const described = await locked.getAttribute("aria-describedby");
  expect(described).toBeTruthy();
  const reason = await page.locator(`[id="${described}"]`).innerText();
  expect(reason).toMatch(/^Locked: \S/);
  const box = await locked.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("a person's profile lists their interactions", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Relationships", exact: true })
    .click();
  if (await page.getByText("No one yet.").isVisible()) return; // no relatives in this life
  const row = page.getByRole("button", { name: /Closeness \d+/ }).first();
  await row.click();
  await expect(
    page.getByRole("heading", { name: "Interactions" }),
  ).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`menu pages have no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    for (const menu of [
      "occupation",
      "assets",
      "relationships",
      "activities",
    ]) {
      await openMenu(page, menu);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, menu).toEqual([]);
      await page.getByRole("button", { name: "Back" }).click();
    }
    await openMenu(page, "assets");
    await page.getByRole("button", { name: "Shopping" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
