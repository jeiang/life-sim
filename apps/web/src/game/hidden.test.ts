import bcrypt from "bcryptjs";
import { describe, expect, test } from "vitest";
import { loadHidden, verifyCode } from "./hidden.ts";

// Throwaway test code and hash; the real code never appears in the repo.
const HASH = bcrypt.hashSync("test-code", 4);

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("verifyCode", () => {
  test("accepts the right code, ignoring surrounding spaces", async () => {
    expect(await verifyCode("test-code", HASH)).toBe(true);
    expect(await verifyCode("  test-code ", HASH)).toBe(true);
  });
  test("rejects a wrong code", async () => {
    expect(await verifyCode("nope", HASH)).toBe(false);
    expect(await verifyCode("TEST-CODE", HASH)).toBe(false);
    expect(await verifyCode("", HASH)).toBe(false);
  });
  test("rejects everything when the build has no hash or a malformed one", async () => {
    expect(await verifyCode("test-code", undefined)).toBe(false);
    expect(await verifyCode("test-code", "")).toBe(false);
    expect(await verifyCode("test-code", "not-a-bcrypt-hash")).toBe(false);
  });
});

describe("loadHidden", () => {
  test("a fresh install is locked with both switches off", () => {
    expect(loadHidden(memory())).toEqual({
      unlocked: false,
      god: false,
      mature: false,
    });
    expect(loadHidden(null).unlocked).toBe(false);
  });
  test("the new unlock keeps switches as stored", () => {
    const s = memory({
      "life-sim:hidden-unlocked": "1",
      "life-sim:mature-mode": "1",
    });
    expect(loadHidden(s)).toEqual({ unlocked: true, god: false, mature: true });
  });
  test("an install unlocked by the old code stays unlocked with god mode on", () => {
    const s = memory({ "life-sim:god-mode": "1" });
    expect(loadHidden(s)).toEqual({ unlocked: true, god: true, mature: false });
    expect(s.m.get("life-sim:hidden-unlocked")).toBe("1");
    s.removeItem("life-sim:god-mode");
    expect(loadHidden(s)).toEqual({
      unlocked: true,
      god: false,
      mature: false,
    });
  });
});
