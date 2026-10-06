import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  choose,
  deserializeWorld,
  GENDERS,
  type Gender,
  getPerson,
  indexBundles,
  newLife,
  renderText,
  replay,
  serializeWorld,
  updatePerson,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const compiled = compilePacks(join(HERE, "fixtures", "packs"));
if (!compiled.ok)
  throw new Error(compiled.diagnostics.map((d) => d.message).join("\n"));
const bundles = compiled.bundles;
const idx = indexBundles(bundles);

const TEXT =
  "{player.Subject} told {player.object} that {player.subject} lost {player.possessive} keys.";
const EXPECT: Record<Gender, string> = {
  male: "He told him that he lost his keys.",
  female: "She told her that she lost her keys.",
  nonbinary: "They told them that they lost their keys.",
};

describe("person gender", () => {
  test("generated people have a gender, deterministic in the seed", () => {
    const w = newLife(bundles, 3);
    for (const p of w.persons.values()) expect(GENDERS).toContain(p.gender);
    expect(newLife(bundles, 3).persons).toEqual(w.persons);
    const seen = new Set<Gender | undefined>();
    for (let seed = 0; seed < 20; seed++)
      for (const p of newLife(bundles, seed).persons.values())
        seen.add(p.gender);
    expect(seen).toEqual(new Set(["male", "female"]));
  });

  test.each(GENDERS)("pronoun placeholders for %s", (g) => {
    const w0 = newLife(bundles, 1);
    const w = updatePerson(w0, w0.playerId, (p) => ({ ...p, gender: g }));
    expect(renderText(TEXT, w, idx, { subject: w.playerId })).toBe(EXPECT[g]);
  });

  test("no gender (old save) reads as neutral", () => {
    const w0 = newLife(bundles, 1);
    const w = updatePerson(w0, w0.playerId, ({ gender: _g, ...p }) => p);
    expect(getPerson(w, w.playerId).gender).toBeUndefined();
    expect(
      renderText(
        "{player.Subject}/{player.object}/{player.possessive}",
        w,
        idx,
        {
          subject: w.playerId,
        },
      ),
    ).toBe("They/them/their");
  });

  test("a gender-less person survives a save round trip", () => {
    const w0 = newLife(bundles, 1);
    const w = updatePerson(w0, w0.playerId, ({ gender: _g, ...p }) => p);
    const back = deserializeWorld(serializeWorld(w));
    expect(getPerson(back, back.playerId).gender).toBeUndefined();
  });

  test("an unbound person name throws", () => {
    const w = newLife(bundles, 1);
    expect(() =>
      renderText("{ghost.subject}", w, idx, { subject: w.playerId }),
    ).toThrow(RangeError);
    expect(() =>
      renderText("{n.subject}", w, idx, {
        subject: w.playerId,
        bound: new Map([["n", 999_999]]),
      }),
    ).toThrow(/no person 999999/);
  });

  test("replay reproduces generated genders", () => {
    let w = newLife(bundles, 11);
    for (let y = 0; y < 8 && !w.ended; y++) {
      w = ageUp(w, bundles).world;
      while (w.pending) w = choose(w, bundles, 0).world;
    }
    const again = replay(11, bundles, w.choiceLog);
    expect(worldHash(again)).toBe(worldHash(w));
    expect([...again.persons.values()].map((p) => p.gender)).toEqual(
      [...w.persons.values()].map((p) => p.gender),
    );
  });
});
