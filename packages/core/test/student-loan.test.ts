import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  choose,
  getPerson,
  newLife,
  runAction,
  updatePerson,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const real = compilePacks(join(HERE, "..", "..", "..", "packs"), {
  only: ["core-loop"],
});
if (!real.ok)
  throw new Error(real.diagnostics.map((d) => d.message).join("\n"));
const bundles = real.bundles;

const PRINCIPAL: Record<string, number> = {
  business: 3600000,
  engineering: 4000000,
  nursing: 3200000,
  arts: 2800000,
};

describe("enrolling with a student loan pays the school, not the player", () => {
  for (const [degree, principal] of Object.entries(PRINCIPAL)) {
    test(degree, () => {
      let w = newLife(bundles, 5);
      w = updatePerson(w, w.playerId, (p) => ({
        ...p,
        age: 18,
        money: 12345,
        qualities: { ...p.qualities, graduated_high_school: true },
      }));
      w = runAction(w, bundles, `core-loop/enrol-${degree}`).world;
      expect(w.pending).not.toBeNull();
      w = choose(w, bundles, 1).world;
      const p = getPerson(w, w.playerId);
      expect(p.money).toBe(12345);
      expect(p.loans.map((l) => l.principal)).toEqual([principal]);
      expect(p.qualities.tuition_by_loan).toBe(true);
    });
  }
});
