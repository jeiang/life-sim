import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compilePacks } from "../../pack-tools/src/index.ts";
import {
  deserializeWorld,
  getPerson,
  newLife,
  type PackBundle,
  replay,
  serializeWorld,
  startStorylet,
  updatePerson,
  type World,
  worldHash,
} from "../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "packs");

/** The `life` fixture plus an `ender` Pack that owns no occupations or groups. */
const ENDER: Record<string, string> = {
  "life/capabilities/jobs.yaml":
    "provides:\n  groups:\n    - full-time\n    - school\n  occupations:\n    - job\n    - side_job\n    - school\n",
  "ender/pack.yaml": "id: ender\n",
  "ender/capabilities/ends.yaml":
    "requires:\n  - life/jobs\nprovides:\n  effects:\n    - clear_jobs\n  storylets:\n    - end-jobs\n    - end-jobs-macro\n    - end-nothing\n",
  "ender/effects/macros.yaml":
    '- id: clear_jobs\n  params: []\n  effects:\n    - end_group("full-time")\n',
  "ender/storylets/actions.yaml": [
    "- id: end-jobs",
    "  trigger: action",
    "  menu: occupation",
    "  outcomes:",
    "    - effects:",
    '        - end_group("full-time")',
    "- id: end-jobs-macro",
    "  trigger: action",
    "  menu: occupation",
    "  outcomes:",
    "    - effects:",
    "        - ender.clear_jobs()",
    "- id: end-nothing",
    "  trigger: action",
    "  menu: occupation",
    "  outcomes:",
    "    - effects:",
    '        - end_group("school")',
    "",
  ].join("\n"),
};

function compileWith(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "end-group-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return compilePacks(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function build(files: Record<string, string>): PackBundle[] {
  const out = compileWith(files);
  if (!out.ok)
    throw new Error(out.diagnostics.map((d) => d.message).join("\n"));
  return [...out.bundles];
}

const bundles = build(ENDER);
const player = (w: World) => getPerson(w, w.playerId);
const adult = (): World => {
  const w = newLife(bundles, 4);
  return updatePerson(w, w.playerId, (p) => ({ ...p, age: 20 }));
};
const kinds = (xs: readonly { kindId: string }[]) => xs.map((o) => o.kindId);

describe("end_group", () => {
  test("a Pack that does not own the jobs ends every occupation in the group", () => {
    let w = startStorylet(adult(), bundles, "life/get-job").world;
    w = startStorylet(w, bundles, "life/enrol").world;
    expect(kinds(player(w).occupations)).toEqual(["life/job", "life/school"]);
    w = startStorylet(w, bundles, "ender/end-jobs").world;
    expect(kinds(player(w).occupations)).toEqual(["life/school"]);
    expect(kinds(player(w).occupationHistory)).toEqual(["life/job"]);
  });

  test("works through an effect macro", () => {
    let w = startStorylet(adult(), bundles, "life/get-side-job").world;
    w = startStorylet(w, bundles, "ender/end-jobs-macro").world;
    expect(player(w).occupations).toHaveLength(0);
    expect(kinds(player(w).occupationHistory)).toEqual(["life/side_job"]);
  });

  test("ends every held occupation of the group, in held order", () => {
    let w = startStorylet(adult(), bundles, "life/get-job").world;
    // Two held occupations in one group cannot arise through start_occupation.
    const first = player(w).occupations[0];
    if (!first) throw new Error("no occupation");
    w = updatePerson(w, w.playerId, (p) => ({
      ...p,
      occupations: [
        ...p.occupations,
        { ...first, id: first.id + 1000, kindId: "life/side_job" },
      ],
    }));
    w = startStorylet(w, bundles, "ender/end-jobs").world;
    expect(player(w).occupations).toHaveLength(0);
    expect(kinds(player(w).occupationHistory)).toEqual([
      "life/job",
      "life/side_job",
    ]);
  });

  test("is a no-op when nothing is held in the group", () => {
    const w = startStorylet(adult(), bundles, "life/get-job").world;
    const after = startStorylet(w, bundles, "ender/end-nothing").world;
    expect(kinds(player(after).occupations)).toEqual(["life/job"]);
  });

  test("replays and round-trips a save", () => {
    let w = startStorylet(newLife(bundles, 11), bundles, "life/get-job").world;
    w = startStorylet(w, bundles, "ender/end-jobs").world;
    expect(worldHash(replay(w.seed, bundles, w.choiceLog))).toBe(worldHash(w));
    const back = deserializeWorld(serializeWorld(w));
    expect(worldHash(back)).toBe(worldHash(w));
  });

  test("an undeclared group is a compile error", () => {
    const out = compileWith({
      ...ENDER,
      "ender/storylets/actions.yaml":
        "- id: bad\n  trigger: action\n  menu: occupation\n  outcomes:\n    - effects:\n        - end_group(nonesuch)\n",
      "ender/capabilities/ends.yaml": "requires:\n  - life/jobs\n",
    });
    expect(out.ok).toBe(false);
    expect(out.diagnostics.map((d) => d.message).join("\n")).toContain(
      "undeclared exclusivity group 'nonesuch'",
    );
  });

  test("a group from a Pack not required is not visible", () => {
    const out = compileWith({
      ...ENDER,
      "ender/capabilities/ends.yaml":
        "provides:\n  storylets:\n    - end-jobs\n    - end-jobs-macro\n    - end-nothing\n",
    });
    expect(out.ok).toBe(false);
  });
});
