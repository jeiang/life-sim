import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  choose,
  describePending,
  indexBundles,
  newLife,
  type World,
} from "../src/index.ts";
import { amountRange } from "../src/sim/storylets.ts";
import type { Pending } from "../src/state/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"));
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;
const idx = indexBundles(bundles);

describe("choose() rejects a choice whose when is false", () => {
  test("every unavailable choice of every choice storylet is refused", () => {
    const base = newLife(bundles, 1);
    let probes = 0;
    let storylets = 0;
    for (const s of idx.storylets.values()) {
      if (s.choices.length === 0) continue;
      if (s.scope === "loan") continue;
      const scope =
        s.scope === "person"
          ? { kind: "person" as const, id: base.playerId }
          : undefined;
      const range = amountRange(base, idx, s, scope);
      const pending: Pending = {
        storyletId: s.id,
        ...(scope ? { scope } : {}),
        ...(range ? { amount: range.min } : {}),
      };
      const w: World = { ...base, pending };
      const view = describePending(w, bundles);
      if (!view) throw new Error(`no view for ${s.id}`);
      storylets++;
      for (const c of view.choices) {
        if (c.enabled) continue;
        probes++;
        expect(() => choose(w, bundles, c.index)).toThrow(RangeError);
        expect(() => choose(w, bundles, c.index)).toThrow(/not available/);
      }
    }
    expect(storylets).toBeGreaterThan(0);
    expect(probes).toBeGreaterThan(0);
  });
});
