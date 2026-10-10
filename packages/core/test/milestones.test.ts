import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  ageUp,
  checkWorldState,
  choose,
  deserializeWorld,
  endLife,
  fireMilestone,
  getPerson,
  indexBundles,
  listActions,
  milestoneReached,
  newLife,
  type PackBundle,
  reachedMilestones,
  replay,
  runAction,
  SAVE_SCHEMA_VERSION,
  type SaveFile,
  scheduledEntries,
  serializeSave,
  serializeWorld,
  succeed,
  updatePerson,
  validateImport,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = join(HERE, "..", "..", "..", "packs");
const FIXTURE = join(HERE, "fixtures", "milestones");

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The real core-loop and karma Packs, the fixture Pack `msx`, and `files` written over them. */
function tree(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "milestones-"));
  dirs.push(dir);
  for (const p of ["core-loop", "karma"])
    cpSync(join(PACKS, p), join(dir, p), { recursive: true });
  cpSync(join(FIXTURE, "msx"), join(dir, "msx"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function build(files: Record<string, string> = {}): PackBundle[] {
  const out = compilePacks(tree(files));
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return [...out.bundles];
}

function failures(files: Record<string, string>): string {
  const out = compilePacks(tree(files));
  expect(out.ok).toBe(false);
  return out.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n");
}

const bundles = build();
const idx = indexBundles(bundles);

const player = (w: World) => getPerson(w, w.playerId);
const q = (w: World, id: string): number =>
  (player(w).qualities[`${id}`] as number | undefined) ?? 0;
const at = (seed: number, age: number): World =>
  updatePerson(newLife(bundles, seed), 0, (p) => ({ ...p, age }));
const act = (w: World, id: string, target?: number) =>
  runAction(w, bundles, `msx/${id}`, target).world;

/** One age-up, answering any decision that opens with its first choice. */
function year(w: World): World {
  let r = ageUp(w, bundles).world;
  while (r.pending) r = choose(r, bundles, 0).world;
  return r;
}
const years = (w: World, n: number): World => {
  let r = w;
  for (let i = 0; i < n; i++) r = year(r);
  return r;
};

describe("milestones: Core emitters", () => {
  test("graduated: finishing the last school stage, once per life", () => {
    let w = act(at(1, 13), "enrol");
    expect(milestoneReached(w, "graduated")).toBe(false);
    w = years(w, 5);
    expect(q(w, "hooks_graduated")).toBe(0);
    w = year(w);
    expect(q(w, "hooks_graduated")).toBe(1);
    expect(milestoneReached(w, "graduated")).toBe(true);
    // The milestone storylet opened in that same age-up, on top of the slots.
    expect(q(w, "celebrated")).toBe(1);
    // A second graduation changes nothing: it fires once.
    w = years(act(w, "enrol"), 6);
    expect(q(w, "hooks_graduated")).toBe(1);
    expect(q(w, "celebrated")).toBe(1);
  });

  test("a milestone storylet whose when fails at the next age-up is dropped for good", () => {
    let w = years(act(at(2, 13), "enrol"), 6);
    expect(q(w, "blocked_fired")).toBe(0);
    w = years(act(w, "open-gate"), 3);
    expect(q(w, "blocked_fired")).toBe(0);
    expect(scheduledEntries(w)).toEqual([]);
  });

  test("first_job: a paying job, not schooling; the decision opens at the next age-up", () => {
    let w = act(at(3, 15), "enrol");
    expect(milestoneReached(w, "first_job")).toBe(false);
    w = act(at(3, 15), "take-job");
    expect(q(w, "hooks_first_job")).toBe(1);
    expect(milestoneReached(w, "first_job")).toBe(true);
    // Queued, not opened yet: it needs the next age-up and a choice.
    expect(scheduledEntries(w).map((e) => e.storyletId)).toEqual([
      "msx/first-pay",
    ]);
    const r = ageUp(w, bundles).world;
    expect(r.pending?.storyletId).toBe("msx/first-pay");
    const done = choose(r, bundles, 1).world;
    expect(q(done, "celebrated")).toBe(2);
    expect(scheduledEntries(done)).toEqual([]);
  });

  test("retired: starting the retirement kind; it is not a first job", () => {
    const w = act(at(4, 60), "retire");
    expect(q(w, "hooks_retired")).toBe(1);
    expect(milestoneReached(w, "retired")).toBe(true);
    expect(milestoneReached(w, "first_job")).toBe(false);
    expect(q(w, "hooks_first_job")).toBe(0);
  });

  test("married: a partner's money merging; once", () => {
    let w = act(at(5, 30), "meet-partner");
    const partner = w.relationships.find((r) => r.role === "core-loop/partner");
    expect(partner).toBeDefined();
    w = act(w, "wed", partner?.to);
    expect(q(w, "hooks_married")).toBe(1);
    w = act(act(w, "meet-partner"), "wed", partner?.to);
    expect(q(w, "hooks_married")).toBe(1);
  });

  test("first_child: a dependent role joining; once", () => {
    let w = act(at(6, 30), "baby");
    expect(q(w, "hooks_first_child")).toBe(1);
    w = act(w, "baby");
    expect(q(w, "hooks_first_child")).toBe(1);
  });

  test("an unrelated start fires nothing", () => {
    const w = at(7, 30);
    expect(reachedMilestones(w)).toEqual([]);
    expect(w.state).toBeUndefined();
  });
});

describe("milestones: Pack-declared", () => {
  test("reach_milestone runs the hooks once, a hook may reach another, the flag reads", () => {
    const before = at(8, 20);
    const locked = (w: World) =>
      listActions(w, bundles, "activities").find(
        (r) => r.id === "msx/check-reached",
      )?.locked;
    expect(locked(before)).toBeTruthy();
    let w = act(before, "adopt-pet");
    expect(q(w, "hooks_pet")).toBe(1);
    expect(q(w, "hooks_chain")).toBe(1);
    expect(reachedMilestones(w)).toEqual(["chain_end", "pet_adopted"]);
    expect(locked(w)).toBeFalsy();
    w = act(w, "adopt-pet");
    expect(q(w, "hooks_pet")).toBe(1);
    w = year(w);
    expect(q(w, "celebrated")).toBe(10);
  });

  test("fireMilestone is once per life too", () => {
    let w = fireMilestone(at(9, 20), bundles, "pet_adopted");
    w = fireMilestone(w, bundles, "pet_adopted");
    expect(q(w, "hooks_pet")).toBe(1);
  });

  test("succession starts the heir's record empty, so each fires again", () => {
    let w = act(act(at(10, 30), "baby"), "adopt-pet");
    const heir = w.relationships.find((r) => r.role === "core-loop/child")?.to;
    expect(heir).toBeDefined();
    w = succeed(endLife(w, w.playerId, "test"), bundles, heir as number).world;
    expect(reachedMilestones(w)).toEqual([]);
    // The qualities are the heir's own (0 before); the hook runs for them.
    w = act(w, "adopt-pet");
    expect(q(w, "hooks_pet")).toBe(1);
    expect(milestoneReached(w, "pet_adopted")).toBe(true);
  });
});

describe("milestones: replay, saves, determinism", () => {
  const played = (seed: number): World => {
    let w = act(at(seed, 14), "take-job");
    w = act(w, "adopt-pet");
    w = year(w);
    w = act(w, "baby");
    return years(w, 2);
  };
  const file = (w: World) =>
    ({
      schemaVersion: SAVE_SCHEMA_VERSION,
      capabilities: bundles.flatMap((b) => b.capabilities),
      appliedMigrations: [],
      lives: [{ id: "a", name: "A", world: w }],
      graveyard: [],
    }) as SaveFile;

  test("the same seed and choices give the same world; replay reproduces it", () => {
    for (const seed of [1, 2, 3]) {
      const w = played(seed);
      expect(worldHash(played(seed))).toBe(worldHash(w));
    }
  });

  test("a milestone fired from a logged action replays", () => {
    // `newLife` seeds the age, so replay from the seed with the log only works from age 0.
    const start = newLife(bundles, 11);
    const w = act(start, "adopt-pet");
    expect(worldHash(replay(11, bundles, w.choiceLog))).toBe(worldHash(w));
    expect(q(w, "hooks_pet")).toBe(1);
  });

  test("world and save round-trip with a record and a queued milestone storylet", () => {
    const w = act(at(12, 20), "adopt-pet");
    expect(scheduledEntries(w).length).toBeGreaterThan(0);
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
    expect(reachedMilestones(back)).toEqual(["chain_end", "pet_adopted"]);
    const text = serializeSave(file(w));
    const out = validateImport(text, bundles);
    expect(out.ok, out.ok ? "" : out.error).toBe(true);
    expect(checkWorldState(w, idx.state)).toEqual([]);
  });

  test("a malformed record rejects the save", () => {
    const w = at(13, 20);
    for (const bad of [{ "Not Id": true }, { pet_adopted: 1 }, 3])
      expect(
        validateImport(
          serializeSave(file({ ...w, state: { _milestones: bad } } as World)),
          bundles,
        ).ok,
        JSON.stringify(bad),
      ).toBe(false);
  });
});

describe("milestones: build-time checks", () => {
  test("a Core milestone cannot be fired by effect", () => {
    expect(
      failures({
        "msx/storylets/more.yaml":
          "- id: bad\n  trigger: action\n  menu: activities\n  outcomes:\n    - effects:\n        - reach_milestone(married)\n",
      }),
    ).toContain("reach_milestone only fires Pack-declared milestones");
  });

  test("an unknown milestone is rejected everywhere it can be named", () => {
    const f = failures({
      "msx/storylets/more.yaml": [
        "- id: a",
        "  trigger: milestone",
        "  milestone: nope",
        "  outcomes: [{ text: x }]",
        "- id: b",
        "  trigger: action",
        "  menu: activities",
        "  when: milestone_reached(nada)",
        "  outcomes:",
        "    - effects:",
        "        - reach_milestone(zilch)",
        "",
      ].join("\n"),
      "msx/pack.yaml":
        "id: msx\nhooks:\n  on_milestone:\n    void:\n      - quality.celebrated += 1\n",
    });
    for (const id of ["nope", "nada", "zilch", "void"])
      expect(f, id).toContain(`undeclared milestone '${id}'`);
  });

  test("a milestone storylet needs its milestone and no event or action fields", () => {
    const f = failures({
      "msx/storylets/more.yaml": [
        "- id: a",
        "  trigger: milestone",
        "  chance: 5%",
        "  outcomes: [{ text: x }]",
        "- id: b",
        "  trigger: event",
        "  chance: 5%",
        "  milestone: graduated",
        "  outcomes: [{ text: x }]",
        "",
      ].join("\n"),
    });
    expect(f).toContain("needs a 'milestone'");
    expect(f).toContain("'chance' is not valid on milestone storylets");
    expect(f).toContain("'milestone' is only valid on milestone storylets");
  });

  test("another Pack's milestone needs a required capability", () => {
    const f = failures({
      "other/pack.yaml":
        'id: other\nhooks:\n  on_milestone:\n    pet_adopted:\n      - journal("hi")\n',
      "other/capabilities/x.yaml": "provides:\n  tags:\n    - t\n",
    });
    expect(f).toContain(
      "is not exported by any capability that Pack 'other' requires",
    );
  });

  test("two Packs cannot provide one milestone", () => {
    const f = failures({
      "other/pack.yaml": "id: other\n",
      "other/capabilities/x.yaml":
        "provides:\n  milestones:\n    - pet_adopted\n",
    });
    expect(f).toContain("provided by both");
  });
});
