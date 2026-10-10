# Agent pipeline guide

How content gets into a Pack, step by step, so every agent works the same way (restructure decisions 12, 13 and 14). One **content item** (a storylet or a chain of them) goes through steps 1 to 5. A whole Pack goes through step 6 once, then step 7.

```
1 fast: sheet -> 2 smol: review -> 3 task: scaffold + implement + tests -> 4 smol: lint + focused-sim (flags only)
      -> implementer tweaks, repeat 3/4 -> 5 (all items done) smol: artemis full-pack run + pack-delta -> 6 PR, ci green, merge
Bugs: one task agent each (see Bugs).
```

Tool references (read the one you use): [vocab](../spec/tools/vocab.md), [scaffold](../spec/tools/scaffold.md), [lint](../spec/tools/lint.md), [focused-sim](../spec/tools/focused-sim.md), [balance-context](../spec/tools/balance-context.md), [pack-delta](../spec/tools/pack-delta.md), [artemis-run](../spec/tools/artemis-run.md). The sheet format is in [content-sheet.md](content-sheet.md). Harness flags and force scripts: [harness](../spec/harness.md). Pack format: [pack-format](../spec/pack-format/index.md).

## Conventions

- **Worktree and branch.** One worktree per issue, never a branch switch in the main checkout: `git -C <repo> fetch -q origin && git -C <repo> worktree add .worktrees/<slug> -b build/<slug> origin/main`. `<slug>` is lowercase `[a-z0-9-]+`, names the issue's work (`dating-first-dates`), and is reused as the artemis slug (step 5). All commands below run in the worktree through `nix develop -c <cmd>` (omit the prefix inside `nix develop`). Remove the worktree after the merge.
- **Sheets.** The sheet of an item is committed with the work at `packs/<id>/sheets/<topic>.md` (`<topic>` is the file name `scaffold` will use under `storylets/`, the title as a slug). The compiler ignores `sheets/`. It is the reference `focused-sim` is re-run against, so it stays in the Pack after the merge, and reviewers read the intent there.
- **Reports.** Local harness reports go to `/tmp/<slug>/<name>/` (never committed). `main` reference report: `pnpm harness --lives 1000 --seed 1 --jobs 4 --out /tmp/<slug>/main` run in a worktree at `origin/main`, or the report path an artemis run printed.
- **Agents.** Agents do not share a conversation: a prompt is self-contained, with the files and command outputs it needs pasted or named by path. Roles use the model role of the same name (`fast`, `smol`, `task`).
- **Scope.** The drafter writes only the sheet. The reviewer and the lint/sim runner only report. Only the `task` implementer edits a Pack.
- **Names.** Content ids join `/` (`pack/name`); the sheet uses the bare id. Expression authoring rules are in [expressions](../spec/pack-format/expressions.md) and [effects](../spec/pack-format/effects.md).

## Step 1: draft the sheet (`fast`)

| | |
|---|---|
| Role | `fast` |
| Inputs | The item brief (from the issue), [content-sheet.md](content-sheet.md), the vocabulary of the owner Pack and its closure |
| Output | `packs/<id>/sheets/<topic>.md` (only this file) |
| Stop | The sheet is written and every `opens` is set. A name the vocabulary lacks goes into a `needs` line, never into an expression |

Commands (the orchestrator pastes the output into the prompt):

```sh
pnpm tool vocab --packs <id>          # markdown, about 100 to 600 lines; exit 0
```

Prompt template:

```text
You are drafting ONE content sheet for the life-sim project. Write only the file
packs/<id>/sheets/<topic>.md. Do not edit any other file and do not edit any Pack.

# Task
<brief: what the item is, which Pack owns it (<id>), its triggers, the intended
outcomes, and the target frequency per life>

# Rules
- Follow the grammar and the worked example in the document below exactly.
- Use only names that appear under "# Vocabulary". Spell them as listed
  (stat.smarts, quality.<id>, <pack>.<macro>(...)). If a name is missing, add a
  `needs` line instead of inventing it in an expression.
- Header `pack: <id>`; `packs:` is exactly: <closure from the vocab title>.
- Give `opens: <lo>..<hi> per life` for every storylet; give `rate` bands for
  outcomes where you can state them.
- Effects are closed effects or listed macros only. Prose is final text with
  {placeholders}.

# Content sheet format
<paste docs/pipeline/content-sheet.md>

# Vocabulary
<paste the output of: pnpm tool vocab --packs <id>>

Return: the path of the sheet and a list of the `needs` lines you added.
```

Expected output: the sheet file; a final message naming the path and the `needs`.

## Step 2: review the sheet (`smol`)

| | |
|---|---|
| Role | `smol` |
| Inputs | The sheet, the vocabulary (same command as step 1), the balance context of `main` |
| Output | A defect list (`file:line: problem`) or `OK`. It rewrites nothing |
| Stop | The list is returned. The drafter (`fast`) fixes the sheet and the review repeats until `OK`, at most 3 rounds; after 3 rounds the orchestrator decides |

Commands:

```sh
pnpm tool vocab --packs <id>
pnpm tool balance-context <main report.json>               # global numbers, under 40 lines; exit 0
pnpm tool balance-context <main report.json> --pack <id>   # the Pack's metrics (exit 1 if the Pack declares none)
pnpm tool scaffold packs/<id>/sheets/<topic>.md --pack <id> --stdout   # parses and checks names; exit 1 and file:line errors if rejected; writes nothing
```

Prompt template:

```text
You review ONE life-sim content sheet: packs/<id>/sheets/<topic>.md. Report defects;
do not rewrite or edit any file.

Check, in this order (the checklist is "Reviewing a sheet" in
docs/pipeline/content-sheet.md):
1. Every line parses and required fields are present. Run
   `pnpm tool scaffold packs/<id>/sheets/<topic>.md --pack <id> --stdout`; every
   error it prints is a defect (exit 0 means grammar and vocabulary pass).
2. Every `next` resolves; every chain step is `chance: 0%` and reached by a `next`.
3. Numbers are sensible for THIS repository. Below is the balance context of main.
   Judge: `chance`/`weight`/`opens` against how often comparable content fires;
   outcome weights against intent (no free money, no certain death unless meant);
   money and stat effects against the ranges in the vocabulary; decisions per
   year against the targets (90/50/30).
4. Each `needs` line has kind, name, type and range, meaning.

# Balance context (main)
<paste: pnpm tool balance-context <report.json>  and  --pack <id> if it prints>

Return `OK` or a numbered list `line: defect (why, suggested number if numeric)`.
```

## Step 3: scaffold, implement, test (`task`)

| | |
|---|---|
| Role | `task` |
| Inputs | The reviewed sheet, the issue, `docs/spec/pack-format/*` |
| Output | `packs/<id>/storylets/<topic>.yaml`, declarations for each `needs` line (with a `#` comment carrying the meaning), any UI fixes, and tests in `packs/<id>/test/` |
| Stop | `pack-tools validate` is clean, the Pack's tests pass, and step 4 has run |

Commands:

```sh
pnpm tool scaffold packs/<id>/sheets/<topic>.md --pack <id>     # writes packs/<id>/storylets/<topic>.yaml; exit 1 if the sheet is rejected or the file exists (--force overwrites)
node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs   # "validated N pack(s)"; exit 1 with file:line diagnostics
pnpm exec vitest run packs/<id>          # the Pack's tests
pnpm harness --check-packs               # "N Packs compile; metrics valid for ..."
```

Implementation checklist:

- `scaffold` prints the `needs` as a to-do list; declare each in the owner Pack (`qualities/*.yaml`, `state/*.yaml`, `effects/*.yaml`).
- Replace placeholders the scaffold cannot know (art, extra tags) and read the generated YAML against the sheet. Keep the storylet ids verbatim.
- Tests: `packs/<id>/test/<topic>.test.ts`, compiled with `compilePacks(root, { only: ["<id>"] })` (see `packs/crime/test/crime.test.ts`). Cover each gate and each outcome's effects; force rare rolls with the harness force keys or `setStreamOverride` rather than looping.
- UI: fix any screen the content needs in `apps/web`; add or update its Playwright spec.
- Format only the files you changed: `biome check --write <files>`.

Prompt template:

```text
You implement ONE reviewed content sheet in the life-sim repo. Work only in the
worktree <abs path>. Issue: #<N>.

Steps:
1. Run `pnpm tool scaffold packs/<id>/sheets/<topic>.md --pack <id>`. If it rejects
   the sheet, stop and return the errors.
2. Declare every `needs` name in Pack <id> with a `#` comment giving its meaning.
3. Edit the generated packs/<id>/storylets/<topic>.yaml where the sheet needs
   more than the scaffold can express. Do NOT change numbers or prose from the
   sheet without reporting it.
4. Fix any UI the content needs in apps/web.
5. Write tests in packs/<id>/test/.
6. Run `node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs`
   and `pnpm exec vitest run packs/<id>`. Both must pass.
7. Format changed files with `biome check --write <files>`.

Do not run the full test suite, the artemis script or `lint`/`focused-sim`
(step 4 is a separate agent). Return: files changed, `needs` declared, any
deviation from the sheet.
```

## Step 4: lint and focused sim (`smol`, flags only)

| | |
|---|---|
| Role | `smol` |
| Inputs | The Pack (with the implementation), the sheet |
| Output | A flag list: each lint finding and each focused-sim flag, verbatim, plus `clean` when none. It edits nothing |
| Stop | The list is returned to the implementer, who tweaks and re-runs steps 3 and 4 until clean or until a flag is explained in writing (lint: a `lint.yaml` allow entry with a `reason`; sim: a note in the PR). After 3 rounds the orchestrator decides |

Commands:

```sh
pnpm tool lint --packs <id>                                                    # exit 0 clean (warnings listed), 1 on errors
pnpm tool focused-sim --pack <id> --sheet packs/<id>/sheets/<topic>.md         # about 15 s; exit 0 even with flags
```

Expected output: lint prints `# Lint: E error(s), W warning(s)` and one bullet per finding (`error L002 ...`). `focused-sim` prints the runs, then `## Flags` (`off-band`, `never-fired`, `never-reached`, `over-decisions`, `not-in-pack`, `structure`), the fire-rate table and the outcome-share table. A run stopped at the time budget is marked; flags are judged against two standard errors, so a short run does not flag noise.

Prompt template:

```text
You check one life-sim Pack change and ONLY FLAG. Do not edit any file, tune any
number, or fix anything. Worktree <abs path>, Pack <id>, sheet
packs/<id>/sheets/<topic>.md.

Run, in this order:
  pnpm tool lint --packs <id>
  pnpm tool focused-sim --pack <id> --sheet packs/<id>/sheets/<topic>.md

Return:
- the lint exit status and every finding verbatim (code, subject, message);
- every focused-sim flag verbatim, with the measured value and the sheet band;
- `clean` if lint has no errors and focused-sim has no flags.
Nothing else: no advice, no patches.
```

## Step 5: full-pack run on artemis (`smol`, after the whole Pack is done)

| | |
|---|---|
| Role | `smol` |
| Inputs | The pushed branch `build/<slug>`, a `main` report (`report.json` from an artemis run of `main`, or a local 1000-life run) |
| Output | The artemis report path, the `pack-delta` output, the flagged lines |
| Stop | The report exists and the delta is read out. Flags that the sheet does not explain go back to the implementer (tweak, push, re-run once). Exit 75 (refused: queue deadline or slug busy) means retry later, not a failure |

Never start an ad hoc heavy run on artemis; this script is the only way and it limits concurrency and load itself ([artemis-run](../spec/tools/artemis-run.md)). The ref must be pushed first.

```sh
git push -u origin build/<slug>
scripts/artemis-run.sh --dry-run <slug> build/<slug>    # prints the plan; changes nothing on artemis
scripts/artemis-run.sh <slug> build/<slug>              # default --lives 10000; last stdout line: .../report.md on artemis
scp artemis.jeiang.vpn:<dir>/report.json /tmp/<slug>/new/report.json   # <dir> is the printed path without report.md
pnpm tool pack-delta <main report.json> /tmp/<slug>/new/report.json --pack <id>   # exit 0; --fail-on-breach exits 1 on flags
pnpm tool balance-context /tmp/<slug>/new/report.json --pack <id>
```

Use `main` and the branch with the same extra harness arguments (`-- --seed 20260101` after the ref) so the reports are comparable. Exit 1 from the script means engine faults: the report is still printed, and the faults are the first thing to return. `pack-delta` flags a fire rate change of 10% (and 0.001 per life), a death-cause share change of 2 points, and a Pack metric change of 10%.

Prompt template:

```text
You run the full-pack balance check for life-sim branch build/<slug> (Pack <id>).
Do not edit any file and do not start any run on artemis other than the one below.

1. Ensure the branch is pushed (`git push -u origin build/<slug>`).
2. Run `scripts/artemis-run.sh <slug> build/<slug>`. If it exits 75, wait and run it
   again, at most 3 times. Never use ssh to run anything else on artemis.
3. Copy the printed report.json to /tmp/<slug>/new/.
4. Run `pnpm tool pack-delta <main report.json> /tmp/<slug>/new/report.json --pack <id>`
   and `pnpm tool balance-context /tmp/<slug>/new/report.json`.

Return: the report path, the script exit status, engine faults (if any), the
`pack-delta` output with the flagged lines, and the balance-context numbers.
Only report; no tuning.
```

## Step 6: PR, CI, merge

```sh
git push -u origin build/<slug>
gh pr create --repo jeiang/life-sim --title "<conventional commit>" --body "Closes #<N> ..."
gh pr checks <PR> --repo jeiang/life-sim --watch      # ci: eval, package, check (biome|vitest|versions|packs|e2e|harness)
gh pr merge <PR> --repo jeiang/life-sim --squash --delete-branch
```

The PR body has `Closes #<N>`, the summary, the sheet path, the lint/focused-sim result, the artemis report path and the `pack-delta` summary, and any deviation. Required checks are the `ci` workflow contexts; `harness-10k` is informational (it runs on `main`, on the `balance` label and on demand). Rebase only on conflict or when main took your schema or migration number. Merge only when every required check is green. Afterwards confirm the issue closed and `git worktree remove .worktrees/<slug>`.

## Bugs

One `task` agent per bug, in its own worktree and PR (`build/fix-<slug>`). The agent writes a failing test first (force the roll or choice with `--force`/`--script` or the Core override seam, see [harness](../spec/harness.md)), fixes the cause, runs `pnpm tool lint --packs <id>` for the touched Packs, and follows step 6. Prompt:

```text
Fix ONE bug in life-sim, issue #<N>, in worktree <abs path>:
<symptom, repro (seed, force keys or script), expected vs actual>

1. Reproduce it with a failing test (packs/<id>/test/ or the owning package).
2. Fix the cause, not the symptom; touch only what the bug needs.
3. Run the test, `node --experimental-strip-types packages/pack-tools/src/cli.ts validate packs`
   and `pnpm tool lint --packs <id>`.
4. Commit (Conventional Commits), open a PR with `Closes #<N>`, wait for `ci`, merge.
Return: PR URL, merge SHA, root cause in two lines.
```

## Step 7: after all main content

A full rebalance of every Pack runs after the last main content item merges (decision 13): an artemis run of `main`, then `pack-delta` against the previous main report, and tuning issues per Pack follow the same steps 3 to 6. A release is a `v<N>` tag cut by the user; `release.yml` shards the run across all profiles and forced scripts and fails on faults or never-fired content.

## Stop conditions (all steps)

- A tool exits 2 (usage error) or a command in this guide does not exist: stop and report; do not improvise a substitute.
- The sheet is rejected by `scaffold` or does not parse: back to step 1 (`fast`), never patched by the implementer.
- Three rounds of the same review or tweak loop: stop and return the open flags to the orchestrator.
- An issue's own instruction to "stop and report" wins over this guide.
- Never edit another issue's files, the specs or other Packs' content except to fix a proven factual error (say so in the PR). Never print or commit secrets.
