import { defineConfig } from "vitest/config";

// Unit tests are *.test.ts. Playwright specs (*.spec.ts) are never collected here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.spec.ts"],
  },
});
