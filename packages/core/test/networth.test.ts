import { describe, expect, test } from "vitest";
import {
  addMoney,
  type NetWorthPoint,
  newLife,
  recordNetWorth,
} from "../src/index.ts";

describe("recordNetWorth", () => {
  test("appends per age and replaces a same-age point", () => {
    const w = newLife([], 1);
    const h1 = recordNetWorth([], w);
    expect(h1).toHaveLength(1);
    const w2 = addMoney(w, w.playerId, 500);
    const h2: readonly NetWorthPoint[] = recordNetWorth(h1, w2);
    expect(h2).toHaveLength(1);
    expect(h2[0]?.value).toBe((h1[0]?.value ?? 0) + 500);
    expect(recordNetWorth(h2, w2)).toBe(h2);
  });
});
