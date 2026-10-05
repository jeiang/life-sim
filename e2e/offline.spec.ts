import { expect, test } from "@playwright/test";

test("after the service worker installs, the app reloads offline and still ages up", async ({
  page,
  context,
  browserName,
}) => {
  // Playwright's WebKit cannot navigate while offline emulation is on ("WebKit encountered an
  // internal error"), even for pages a service worker could answer; Chromium covers the check.
  test.skip(
    browserName === "webkit",
    "WebKit offline emulation breaks navigation",
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Age", exact: true }),
  ).toBeVisible();
  // `ready` resolves once a worker is active, which is after the precache is complete.
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first load is not controlled by the worker; reload so the offline load is served by it.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  const age = page.getByRole("button", { name: "Age", exact: true });
  await expect(age).toBeVisible();
  await age.click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 20 && (await dialog.isVisible()); i++)
    await dialog
      .getByRole("button")
      .and(page.locator(":enabled"))
      .first()
      .click();
  await expect(
    page.getByRole("heading", { name: /^Age 1 year/i }),
  ).toBeVisible();
});
