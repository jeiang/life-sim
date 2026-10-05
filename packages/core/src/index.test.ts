import { expect, test } from "vitest";
import { CORE_PACKAGE } from "./index.ts";

test("core package is wired into the workspace", () => {
  expect(CORE_PACKAGE).toBe("@life/core");
});
