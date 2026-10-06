import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compilePacks } from "./compile.ts";
import { formatDiagnostic } from "./diagnostics.ts";
import { iconManifest, writeOutput } from "./output.ts";
import { jsonSchemas } from "./schema-export.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "test", "fixtures", "valid");
const tmp: string[] = [];
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

/**
 * Copy the valid fixture, then apply edits: a function rewrites a file, a string replaces it,
 * `null` deletes it.
 */
function fixture(
  edits: Record<string, ((text: string) => string) | string | null> = {},
): string {
  const dir = mkdtempSync(join(tmpdir(), "packs-"));
  tmp.push(dir);
  cpSync(VALID, dir, { recursive: true });
  for (const [file, edit] of Object.entries(edits)) {
    const path = join(dir, file);
    if (edit === null) rmSync(path);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        typeof edit === "string"
          ? edit
          : edit(existsSync(path) ? readFileSync(path, "utf8") : ""),
      );
    }
  }
  return dir;
}

function errors(edits: Parameters<typeof fixture>[0]): string[] {
  const r = compilePacks(fixture(edits));
  expect(r.ok).toBe(false);
  return r.diagnostics.map(formatDiagnostic);
}

function expectError(
  edits: Parameters<typeof fixture>[0],
  ...needles: string[]
): void {
  const msgs = errors(edits);
  for (const n of needles) {
    expect(
      msgs.some((m) => m.includes(n)),
      `expected '${n}' in:\n${msgs.join("\n")}`,
    ).toBe(true);
  }
}

const subIn = (src: string, a: string, b: string): string => {
  expect(src).toContain(a);
  return src.replace(a, b);
};
const sub = (a: string, b: string) => (t: string) => {
  expect(t).toContain(a);
  return t.replace(a, b);
};

describe("valid fixture", () => {
  test("compiles with namespaced ids and resolved references", () => {
    const r = compilePacks(VALID);
    expect(r.diagnostics.map(formatDiagnostic)).toEqual([]);
    expect(r.bundles.map((b) => b.id)).toEqual(["base", "core-loop", "extra"]);
    const base = r.bundles[0];
    const offer = base?.storylets.find((s) => s.id === "base/first-job-offer");
    expect(offer?.chance).toBe(400);
    expect(offer?.choices[0]?.outcomes[1]?.next).toBe("base/job-hunt-tips");
    expect(offer?.choices[0]?.outcomes[0]?.effects[0]).toEqual([
      "do",
      "start_occupation",
      ["id", "base/cashier"],
    ]);
    const extra = r.bundles[2];
    expect(extra?.storylets[0]?.outcomes[0]?.effects[0]).toEqual([
      "do",
      "start_occupation",
      ["id", "base/cashier"],
    ]);
  });

  test("a spawned person is in scope for later effects and the outcome text", () => {
    const r = compilePacks(VALID);
    const s = r.bundles[0]?.storylets.find(
      (x) => x.id === "base/meet-neighbour",
    );
    expect(s?.outcomes[0]?.effects[0]?.[0]).toBe("spawn");
    expect(s?.outcomes[0]?.effects[1]).toEqual([
      "add",
      ["relationship", "n", "closeness"],
      10,
    ]);
  });

  test("a directory without a manifest or content is skipped", () => {
    const dir = fixture({ "placeholder/README.md": "nothing here" });
    expect(compilePacks(dir).ok).toBe(true);
  });

  test("loan rates compile to basis points", () => {
    const r = compilePacks(VALID);
    expect(r.bundles[0]?.loans.map((l) => [l.id, l.rateBp])).toEqual([
      ["base/auto-loan", 750],
      ["base/student-loan", 400],
    ]);
  });
});

describe("build checks fail", () => {
  test("YAML syntax error", () => {
    expectError(
      { "base/storylets/work.yaml": "- id: a\n  trigger: [event\n" },
      "base/storylets/work.yaml",
      "YAML",
    );
  });

  test("duplicate YAML keys", () => {
    expectError(
      {
        "base/loans/kinds.yaml":
          "- id: a\n  label: A\n  label: B\n  rate: 1%\n  term_years: 1\n",
      },
      "YAML",
    );
  });

  test("yes/no are strings, not booleans (YAML 1.2)", () => {
    expectError(
      { "base/storylets/work.yaml": sub("once: true", "once: yes") },
      "first-job-offer.once",
    );
  });

  test("schema violations: unknown field, missing field, bad enum", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "trigger: event\n  chance: 4%",
          "trigger: sometimes\n  chance: 4%\n  bogus: 1",
        ),
      },
      "unknown field 'bogus'",
      "expected one of: event, action",
    );
    expectError(
      { "base/loans/kinds.yaml": sub("  term_years: 5\n", "") },
      "missing required field 'term_years'",
    );
    expectError({ "base/pack.yaml": sub("version: 2", "version: 0") });
  });

  test("duplicate ids, within and across files and kinds", () => {
    expectError(
      {
        "base/items/more.yaml":
          "- id: cashier\n  label: x\n  category: c\n  price: 1\n  value: 1\n",
      },
      "duplicate id 'cashier'",
    );
  });

  test("pack id must equal its directory", () => {
    expectError(
      { "base/pack.yaml": sub("id: base", "id: other") },
      "must equal its directory name",
    );
  });

  test("expression syntax error", () => {
    expectError(
      { "base/storylets/work.yaml": sub("age >= 16 and", "age >= and") },
      "first-job-offer.when",
    );
  });

  test("undeclared name in expression", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "stat.smarts >= 30",
          "stat.charm >= 30",
        ),
      },
      "unknown name 'stat.charm'",
    );
  });

  test("type error: integer where boolean is needed", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "when: age >= 16 and",
          "when: age + 1 or",
        ),
      },
      "expected a boolean",
    );
  });

  test("constant zero divisor", () => {
    expectError(
      {
        "base/items/stuff.yaml": sub(
          "asset.value * 60 / 100",
          "asset.value / 0",
        ),
      },
      "division by zero",
    );
  });

  test("scope names only exist under their scope", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "when: loan.missed > 0",
          "when: loan.missed > 0 and person.age > 1",
        ),
      },
      "unknown name 'person.age'",
    );
    expectError(
      { "base/storylets/work.yaml": sub("  scope: loan\n", "") },
      "unknown name 'loan.missed'",
    );
  });

  test("undeclared Pack dependency", () => {
    expectError(
      { "extra/pack.yaml": sub("depends: [base]", "depends: []") },
      "'base/cashier' refers to Pack 'base', which is not declared in depends",
    );
  });

  test("dependency on an unknown Pack, self, and cycles", () => {
    expectError(
      { "extra/pack.yaml": sub("[base]", "[nowhere]") },
      "unknown dependency 'nowhere'",
    );
    expectError(
      { "extra/pack.yaml": sub("[base]", "[extra]") },
      "cannot depend on itself",
    );
    expectError(
      { "base/pack.yaml": sub("id: base\n", "id: base\ndepends: [extra]\n") },
      "dependency cycle",
    );
  });

  test("a quality or stat declared by two Packs names both Packs", () => {
    const dup = (decl: string) => (t: string) => `${t}${decl}`;
    // extra depends on base.
    expectError(
      {
        "extra/pack.yaml": dup(
          "qualities:\n  - { id: has_diploma, type: flag, default: false }\n",
        ),
      },
      "quality 'has_diploma' is declared by both Pack 'base' and Pack 'extra'",
    );
    expectError(
      {
        "extra/pack.yaml": dup(
          "stats:\n  - { id: smarts, label: Smarts, start: [0, 100] }\n",
        ),
      },
      "stat 'smarts' is declared by both Pack 'base' and Pack 'extra'",
    );
    // No dependency between the Packs.
    expectError(
      {
        "extra/pack.yaml":
          "id: extra\nversion: 1\nqualities:\n  - { id: has_diploma, type: flag, default: false }\n",
      },
      "quality 'has_diploma' is declared by both Pack 'base' and Pack 'extra'",
    );
  });

  test("distinct prefixed quality ids across Packs compile", () => {
    const dir = fixture({
      "extra/pack.yaml": (t) =>
        `${t}qualities:\n  - { id: extra_flag, type: flag, default: false }\n`,
    });
    expect(compilePacks(dir).diagnostics.map(formatDiagnostic)).toEqual([]);
  });

  test("dangling `next`", () => {
    expectError(
      { "base/storylets/work.yaml": sub("next: job-hunt-tips", "next: nope") },
      "dangling reference 'nope'",
    );
  });

  test("dangling id in effects and in a namespaced reference", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "start_occupation(cashier)",
          "start_occupation(waiter)",
        ),
      },
      "dangling reference 'waiter'",
    );
    expectError(
      { "extra/storylets/more.yaml": sub("base/phone", "base/pager") },
      "dangling reference 'base/pager'",
    );
    expectError(
      { "extra/storylets/more.yaml": sub("base/phone", "ghost/phone") },
      "no Pack 'ghost'",
    );
  });

  test("reference of the wrong kind", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "start_occupation(cashier)",
          "start_occupation(phone)",
        ),
      },
      "'phone' is a item, expected occupation",
    );
    expectError(
      {
        "base/storylets/work.yaml": sub("next: job-hunt-tips", "next: cashier"),
      },
      "is a occupation, expected storylet",
    );
  });

  test("dangling kind references in occupations and items", () => {
    expectError(
      { "base/items/stuff.yaml": sub("loan: auto-loan", "loan: gone-loan") },
      "dangling reference 'gone-loan'",
    );
    expectError(
      {
        "base/occupations/jobs.yaml": sub(
          "promotes_to: shift-lead",
          "promotes_to: boss",
        ),
      },
      "dangling reference 'boss'",
    );
    expectError(
      { "base/occupations/jobs.yaml": sub("group: school", "group: nope") },
      "undeclared exclusivity group 'nope'",
    );
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "not has_occupation(cashier)",
          'not in_group("nope")',
        ),
      },
      "undeclared exclusivity group 'nope'",
    );
  });

  test("a reference to a Pack that is not a dependency", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "start_occupation(cashier)",
          "start_occupation(extra/anything)",
        ),
      },
      "not declared in depends",
    );
  });

  test("unknown placeholder", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "{player.first_name}",
          "{player.nickname}",
        ),
      },
      "unknown placeholder '{player.nickname}'",
    );
    expectError(
      { "base/storylets/work.yaml": sub("{loan.payment}", "{person.age}") },
      "unknown placeholder",
    );
  });

  test("a spawned person is not in scope outside its outcome", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "text: Someone moves in next door.",
          'text: "Say hi to {n.first_name}"',
        ),
      },
      "unknown placeholder '{n.first_name}'",
    );
    expectError(
      {
        "base/storylets/work.yaml": sub(
          'journal("Met {n.first_name} {n.last_name}.")',
          'journal("Met {m.first_name}.")',
        ),
      },
      "unknown placeholder '{m.first_name}'",
    );
  });

  test("pronoun placeholders resolve for the player and spawned people only", () => {
    const ok = compilePacks(
      fixture({
        "base/storylets/work.yaml": sub(
          'journal("Met {n.first_name} {n.last_name}.")',
          'journal("{n.Subject} met {player.object}; {n.possessive} day.")',
        ),
      }),
    );
    expect(ok.diagnostics.map(formatDiagnostic)).toEqual([]);
    const cond = compilePacks(
      fixture({
        "base/storylets/work.yaml": sub(
          "person.age > 50",
          'person.gender == "female" and player.gender != "male" and person.age > 50',
        ),
      }),
    );
    expect(cond.diagnostics.map(formatDiagnostic)).toEqual([]);
    expectError(
      {
        "base/storylets/work.yaml": sub(
          'journal("Met {n.first_name} {n.last_name}.")',
          'journal("{m.subject} met {n.pronoun}.")',
        ),
      },
      "unknown placeholder '{m.subject}'",
      "unknown placeholder '{n.pronoun}'",
    );
  });

  test("unknown person in relationship effect", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "relationship(n).closeness",
          "relationship(z).closeness",
        ),
      },
      "unknown person 'z'",
    );
  });

  test("unknown icon, Lucide rejected, malformed game-icons ref", () => {
    expectError(
      { "base/storylets/work.yaml": sub("icon: 💼", "icon: notanicon") },
      "unknown icon 'notanicon'",
    );
    expectError(
      { "base/storylets/work.yaml": sub("icon: 💼", "icon: lucide/briefcase") },
      "Lucide icons are UI chrome only",
    );
    expectError(
      {
        "base/storylets/work.yaml": sub("gameicons/lorc/spy", "gameicons/spy"),
      },
      "unknown icon",
    );
    expectError(
      { "base/pack.yaml": sub("icon: 😀", "icon: 😀😀") },
      "unknown icon",
    );
  });

  test("removing a shipped id without a migration entry fails, with the id named", () => {
    expectError(
      {
        "base/ids.lock.json": sub(
          '"base/cashier"',
          '"base/cashier",\n    "base/lost-job"',
        ),
      },
      "id 'base/lost-job' shipped in release v1 but is gone",
    );
  });

  test("a rename without its migration entry fails", () => {
    expectError(
      {
        "base/ids.lock.json": sub(
          '"base/cashier"',
          '"base/cashier",\n    "base/waiter"',
        ),
      },
      "id 'base/waiter'",
    );
  });

  test("migrations must point at things that exist, and not at ids still present", () => {
    expectError(
      { "base/pack.yaml": sub("to: first-job-offer", "to: nowhere") },
      "rename target 'nowhere' does not exist",
    );
    expectError(
      { "base/pack.yaml": sub("from: old-job-offer", "from: cashier") },
      "'cashier' is renamed but still exists",
    );
    expectError(
      {
        "base/pack.yaml": sub("fallback: first-job-offer", "fallback: missing"),
      },
      "dangling reference 'missing'",
    );
  });

  test("version may not go backwards", () => {
    expectError(
      {
        "base/pack.yaml": sub("version: 2", "version: 1"),
        "base/ids.lock.json": sub('"version": 1', '"version": 3'),
      },
      "lower than the released version",
    );
  });

  test("event needs exactly one of chance or weight; action needs a menu", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "  chance: 4%\n",
          "  chance: 4%\n  weight: 3\n",
        ),
      },
      "exactly one of 'chance' or 'weight'",
    );
    expectError(
      { "base/storylets/work.yaml": sub("  menu: activities/job-board\n", "") },
      "needs a 'menu'",
    );
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "  menu: activities/job-board\n",
          "  menu: bank\n",
        ),
      },
      "menu",
    );
  });

  const PERSON_ACTION = `- id: chat
  trigger: action
  menu: relationships
  scope: person
  target: [neighbour]
  when: person.role == base/neighbour and person.alive and person.age >= 3
  outcomes:
    - effects:
        - relationship(person).closeness += 5
        - die("old age")
`;

  test("person-scoped actions: target roles, person.role/alive, relationship(person)", () => {
    const r = compilePacks(
      fixture({ "base/storylets/targeted.yaml": PERSON_ACTION }),
    );
    expect(r.ok, r.diagnostics.map(formatDiagnostic).join("\n")).toBe(true);
    const chat = r.bundles
      .flatMap((b) => b.storylets)
      .find((x) => x.id === "base/chat");
    expect(chat).toMatchObject({ scope: "person", target: ["base/neighbour"] });
  });

  const FAMILY = `family:
  player: base/local
  parent: { role: base/neighbour, generator: base/local, count: 2 }
  sibling: { role: base/neighbour, generator: base/local, count: [0, 2] }
`;

  test("manifest family resolves to full ids; dangling or inverted ranges fail", () => {
    const withFamily = (f: string) => ({
      "core-loop/pack.yaml": (t: string) => `${t}${f}`,
    });
    const r = compilePacks(fixture(withFamily(FAMILY)));
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.bundles.find((b) => b.id === "core-loop")?.family).toEqual({
        player: "base/local",
        parent: { role: "base/neighbour", generator: "base/local", count: 2 },
        sibling: {
          role: "base/neighbour",
          generator: "base/local",
          count: [0, 2],
        },
      });
    expectError(
      withFamily(
        FAMILY.replace(
          "generator: base/local, count: 2",
          "generator: base/nobody, count: 2",
        ),
      ),
      "dangling reference 'base/nobody'",
    );
    expectError(
      withFamily(FAMILY.replace("[0, 2]", "[2, 0]")),
      "count range minimum exceeds maximum",
    );
  });

  test("only core-loop may declare year or family", () => {
    expectError(
      {
        "extra/pack.yaml": (t: string) =>
          `${t}year:\n  slots: [1, 1]\n  cap: 2\n`,
      },
      "only Pack 'core-loop' may declare 'year'",
    );
    expectError(
      {
        "extra/pack.yaml": (t: string) =>
          `${t}${FAMILY.replaceAll("base/", "extra/")}`,
      },
      "only Pack 'core-loop' may declare 'family'",
    );
  });

  test("a storylet label is kept on actions and rejected on events", () => {
    const r = compilePacks(
      fixture({
        "base/storylets/targeted.yaml": PERSON_ACTION.replace(
          "- id: chat\n",
          "- id: chat\n  label: Chat up\n",
        ),
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(
        r.bundles.flatMap((b) => b.storylets).find((s) => s.id === "base/chat")
          ?.label,
      ).toBe("Chat up");
    expectError(
      {
        "base/storylets/work.yaml": (t) =>
          t.replace("trigger: event", "label: Nope\n  trigger: event"),
      },
      "'label' is only valid on action storylets",
    );
  });

  test("repeatable actions: curve resolves, cooldown and events are rejected", () => {
    const tips = (t: string) =>
      t.replace(
        "  trigger: action\n  menu: activities/job-board\n",
        "  trigger: action\n  menu: activities/job-board\n  repeatable: true\n  repeat: { full: 3, factor: 40% }\n",
      );
    const r = compilePacks(fixture({ "base/storylets/work.yaml": tips }));
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(
        r.bundles
          .flatMap((b) => b.storylets)
          .find((x) => x.id === "base/job-hunt-tips")?.repeat,
      ).toEqual({ full: 3, factorBp: 4000 });
    expectError(
      {
        "base/storylets/work.yaml": (t) =>
          tips(t).replace(
            "  repeatable: true\n",
            "  repeatable: true\n  cooldown: 1\n",
          ),
      },
      "a repeatable action has no 'cooldown'",
    );
    expectError(
      {
        "base/storylets/work.yaml": (t) =>
          t.replace("trigger: event", "repeatable: true\n  trigger: event"),
      },
      "'repeatable' is only valid on action storylets",
    );
  });

  test("action scope and target mistakes are reported", () => {
    expectError(
      {
        "base/storylets/targeted.yaml": subIn(
          PERSON_ACTION,
          "  scope: person\n",
          "  scope: loan\n",
        ),
      },
      "actions can only use 'scope: person'",
    );
    expectError(
      {
        "base/storylets/targeted.yaml": subIn(
          PERSON_ACTION,
          "  scope: person\n",
          "",
        ),
      },
      "'target' needs 'scope: person'",
    );
    expectError(
      {
        "base/storylets/targeted.yaml": subIn(
          PERSON_ACTION,
          "target: [neighbour]",
          "target: [local]",
        ),
      },
      "'local' is a generator, expected role",
    );
  });

  test("item requires and loan down payment compile; bad ones are reported", () => {
    const r = compilePacks(
      fixture({
        "base/items/stuff.yaml": sub(
          "  loan: auto-loan\n",
          "  requires: age >= 16 and quality.has_diploma\n  loan: auto-loan\n",
        ),
        "base/loans/kinds.yaml": sub(
          "  term_years: 5\n",
          "  term_years: 5\n  down_payment: 12.5%\n",
        ),
      }),
    );
    expect(r.ok, r.diagnostics.map(formatDiagnostic).join("\n")).toBe(true);
    const base = r.bundles.find((b) => b.id === "base");
    expect(base?.items.find((i) => i.id === "base/used-car")?.requires).toEqual(
      expect.anything(),
    );
    expect(base?.loans.map((l) => [l.id, l.downPaymentBp])).toEqual([
      ["base/auto-loan", 1250],
      ["base/student-loan", 0],
    ]);
    expectError(
      {
        "base/items/stuff.yaml": sub(
          "  loan: auto-loan\n",
          "  requires: age >= 16 and quality.nope\n  loan: auto-loan\n",
        ),
      },
      "quality.nope",
    );
    expectError(
      {
        "base/loans/kinds.yaml": sub(
          "  term_years: 5\n",
          "  term_years: 5\n  down_payment: 120%\n",
        ),
      },
      "down payment",
    );
  });

  test("undeclared stat in a people generator", () => {
    expectError(
      {
        "base/people/names.yaml": sub("happiness: [30, 90]", "charm: [30, 90]"),
      },
      "undeclared stat 'charm'",
    );
  });

  test("unknown role in spawn_person", () => {
    expectError(
      {
        "base/storylets/work.yaml": sub(
          "spawn_person(neighbour, local)",
          "spawn_person(local, local)",
        ),
      },
      "'local' is a generator, expected role",
    );
  });
});

describe("output", () => {
  test("writes bundles, copies only referenced Twemoji, and lists credits", () => {
    const out = mkdtempSync(join(tmpdir(), "out-"));
    tmp.push(out);
    const r = compilePacks(VALID);
    writeOutput(r, out);
    expect(readdirSync(join(out, "icons", "twemoji")).sort()).toEqual([
      "1f4bc.svg",
      "1f600.svg",
      "1f697.svg",
      "1f6d2.svg",
    ]);
    const icons = iconManifest(r);
    expect(icons.gameicons.map((g) => g.ref)).toEqual(["gameicons:lorc/spy"]);
    const credits = JSON.parse(
      readFileSync(join(out, "credits.json"), "utf8"),
    ) as { entries: { id: string; license: string; modified: boolean }[] };
    const byId = Object.fromEntries(credits.entries.map((e) => [e.id, e]));
    expect(byId.twemoji?.license).toBe("CC BY 4.0");
    expect(byId["gameicons/lorc"]).toMatchObject({
      license: "CC BY 3.0",
      modified: true,
    });
    expect(byId.lucide?.license).toBe("ISC");
    expect(byId.feather?.license).toBe("MIT");
    const base = JSON.parse(readFileSync(join(out, "base.json"), "utf8")) as {
      id: string;
    };
    expect(base.id).toBe("base");
  });

  test("an unreferenced icon is not copied or credited", () => {
    const out = mkdtempSync(join(tmpdir(), "out-"));
    tmp.push(out);
    const dir = fixture({
      "base/pack.yaml": sub(", icon: 😀", ""),
      "base/storylets/work.yaml": (t) =>
        t
          .replace(/ *icon: gameicons\/lorc\/spy\n/, "")
          .replace(/ *icon: 💼\n/, ""),
      "base/occupations/jobs.yaml": sub("  icon: 🛒\n", ""),
      "base/items/stuff.yaml": sub("  icon: 🚗\n", ""),
    });
    const r = compilePacks(dir);
    expect(r.diagnostics.map(formatDiagnostic)).toEqual([]);
    writeOutput(r, out);
    expect(readdirSync(join(out, "icons", "twemoji"))).toEqual([]);
    expect(r.credits.entries.map((e) => e.id)).toEqual(["lucide", "feather"]);
  });
});

describe("schema export", () => {
  test("committed JSON Schemas match the TypeBox schemas", () => {
    for (const [name, text] of Object.entries(jsonSchemas())) {
      const file = join(HERE, "..", "schema", name);
      expect(
        existsSync(file),
        `${name} missing; run: node --experimental-strip-types packages/pack-tools/src/cli.ts schema`,
      ).toBe(true);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(JSON.parse(text));
    }
  });
});
