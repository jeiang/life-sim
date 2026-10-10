import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  deserializeWorld,
  getPerson,
  newLife,
  type PackBundle,
  replay,
  serializeWorld,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "hooks");

/** The hooks fixture with `files` written over it. */
function inDir<T>(files: Record<string, string>, use: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "settlement-fixture-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function build(files: Record<string, string>): PackBundle[] {
  return inDir(files, (dir) => {
    const out = compilePacks(dir);
    if (!out.ok)
      throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
    return [...out.bundles];
  });
}

function failures(files: Record<string, string>): string {
  return inDir(files, (dir) => {
    const out = compilePacks(dir);
    expect(out.ok).toBe(false);
    return out.diagnostics
      .map((d) => `${d.file} ${d.path}: ${d.message}`)
      .join("\n");
  });
}

const LINES: Record<string, string> = {
  "zeta/pack.yaml": `id: zeta
settlement:
  - { id: gift, kind: income, label: Gift, amount: 1000 }
  - { id: nothing, kind: income, label: Nothing, amount: 0 }
`,
  "alpha/pack.yaml": `id: alpha
settlement:
  - { id: rent, kind: cost, label: Rent, amount: 400, when: age >= 1 }
  - { id: never, kind: cost, label: Never, amount: 50, when: age > 50 }
`,
  "mid/pack.yaml": `id: mid
settlement:
  - { id: tip, kind: income, label: Tip, amount: 200 }
`,
};
const bundles = build(LINES);

/** Labels in the order the bundles list them. */
const LABEL: Record<string, string> = {
  zeta: "Gift",
  alpha: "Rent",
  mid: "Tip",
};
const ORDER = bundles
  .map((b) => LABEL[b.id])
  .filter((l): l is string => l !== undefined);

const lines = (w: World) => w.journal.flatMap((e) => e.lines);

describe("settlement lines", () => {
  test("income and cost lines move the player's money and journal in bundle order", () => {
    const w = ageUp(newLife(bundles, 7), bundles).world;
    const got = lines(w).filter((l) => /^(Gift|Rent|Tip):/.test(l));
    expect(got.map((l) => l.split(":")[0])).toEqual(ORDER);
    expect(got.find((l) => l.startsWith("Gift"))).toBe(
      "Gift: you received $10.00.",
    );
    expect(got.find((l) => l.startsWith("Rent"))).toBe("Rent: you paid $4.00.");
    expect(getPerson(w, w.playerId).money).toBe(
      getPerson(newLife(bundles, 7), w.playerId).money + 1000 + 200 - 400,
    );
  });

  test("zero-amount and false-condition lines post nothing", () => {
    const w = ageUp(newLife(bundles, 7), bundles).world;
    expect(lines(w).some((l) => /^(Nothing|Never):/.test(l))).toBe(false);
  });

  test("a cost is capped at the cash the player has and says so", () => {
    const b = build({
      ...LINES,
      "alpha/pack.yaml": `id: alpha
settlement:
  - { id: rent, kind: cost, label: Rent, amount: 999999 }
`,
    });
    const w = ageUp(newLife(b, 7), b).world;
    // Gift (+10.00), Rent (capped at the cash), then Tip (+2.00): bundle order.
    expect(getPerson(w, w.playerId).money).toBe(200);
    expect(lines(w).some((l) => /^Rent: you could only pay \$\d/.test(l))).toBe(
      true,
    );
  });

  test("a pack without lines leaves the year as it was", () => {
    const plain = build({});
    const w = ageUp(newLife(plain, 7), plain).world;
    expect(lines(w).some((l) => /^(Gift|Rent|Tip):/.test(l))).toBe(false);
  });

  test("replay and a save round trip reproduce a life with lines", () => {
    let w = newLife(bundles, 9);
    w = ageUp(ageUp(w, bundles).world, bundles).world;
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    expect(worldHash(deserializeWorld(serializeWorld(w)))).toBe(worldHash(w));
  });
});

describe("settlement lines: build errors", () => {
  test("an unknown name in an amount points at the manifest", () => {
    const text = failures({
      "mid/pack.yaml": `id: mid
settlement:
  - { id: tip, kind: income, label: Tip, amount: quality.nope }
`,
    });
    expect(text).toMatch(/nope/);
    expect(text).toMatch(/mid\/pack\.yaml settlement/);
  });

  test("a duplicate id is rejected", () => {
    const text = failures({
      "mid/pack.yaml": `id: mid
settlement:
  - { id: tip, kind: income, label: Tip, amount: 1 }
  - { id: tip, kind: cost, label: Tip2, amount: 1 }
`,
    });
    expect(text).toMatch(/duplicate settlement line 'tip'/);
  });

  test("a kind other than income or cost is rejected by the schema", () => {
    const text = failures({
      "mid/pack.yaml": `id: mid
settlement:
  - { id: tip, kind: bonus, label: Tip, amount: 1 }
`,
    });
    expect(text).toMatch(/kind/);
  });
});
