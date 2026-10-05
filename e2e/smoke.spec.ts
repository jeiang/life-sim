import { expect, test } from "@playwright/test";

test("stub page renders and runs script", async ({ page, browserName }) => {
  await page.goto("/");
  await expect(page.locator("#hello")).toHaveText("hello life-sim");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "2");
  console.log(`engine: ${browserName} ${page.context().browser()?.version()}`);
});
