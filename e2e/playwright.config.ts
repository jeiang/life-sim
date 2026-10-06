import { defineConfig, devices } from "@playwright/test";

// bcrypt (cost 4) of the throwaway code in god.spec.ts; the real code's hash is a deploy input.
const E2E_CODE_HASH =
  "$2b$04$3I1WTKvbM9sVlDykQqVyseRdQ2dSJyJSSXHg6FBw5MQLGris9aJIq";
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `VITE_E2E=1 VITE_HIDDEN_CODE_HASH='${E2E_CODE_HASH}' pnpm --filter @life/web build && node --experimental-strip-types serve.ts`,
    timeout: 180_000,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
