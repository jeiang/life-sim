import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command:
      "VITE_E2E=1 pnpm --filter @life/web build && node --experimental-strip-types serve.ts",
    timeout: 180_000,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
