import { defineConfig } from "vitest/config";

// Unit tests are *.test.ts, including a pack's own `packs/<id>/test/`. Playwright specs
// (*.spec.ts) are never collected here.
export default defineConfig({
  test: {
    include: ["**/*.test.ts", "packs/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.spec.ts"],
  },
});
