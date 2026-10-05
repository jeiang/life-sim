# Pack format

Decided in [Pack format and expression language](https://github.com/jeiang/life-sim/issues/10). Terms follow [CONTEXT.md](../../CONTEXT.md). Exact field-level schemas are defined in code (TypeBox) during the build; this document fixes the shape and the rules.

## Files

```
packs/<pack-id>/
  pack.yaml                  # manifest
  storylets/<topic>.yaml     # list of storylets
  occupations/<topic>.yaml   # occupation kinds
  items/<topic>.yaml         # item kinds
  people/<topic>.yaml        # people-generation data (names, stat ranges, roles)
```

- YAML 1.2 only, read with a strict parser (no implicit `yes`/`no` booleans, no duplicate keys).
- A file holds many items of one kind. Every item has an explicit `id`, unique within its Pack.
- Full ids are namespaced: `<pack-id>/<id>` (for example `core-loop/first-job-offer`). Inside its own Pack, an item may use the short id.

## Manifest (`pack.yaml`)

| Field | Meaning |
|---|---|
| `id`, `version` | Pack id and integer version. Saves record the version. |
| `depends` | Pack ids this Pack references. Only these can be referenced. |
| `currency` | Symbol and minor-unit digits (only in the Pack that sets the currency). |
| `stats` | Declared stats: id, label, icon, start range. Always 0 to 100. |
| `qualities` | Declared qualities: id, type (`int` with optional min/max, or `flag`), default. |
| `exclusivity` | Occupation exclusivity groups (for example `school`, `full-time`). |
| `year` | Event draw settings: flavour slot count range and the yearly event cap. |
| `migrations` | Renamed ids (`old -> new`) and removed ids (with a fallback). |

## Composition

- Add-only. A Pack can add content and reference ids from the Packs it depends on. It cannot override or patch another Pack's content.
- Content ids are permanent. A shipped id that disappears without a migration entry fails the build (compared against the previous release's id list).

## Storylet

```yaml
# packs/core-loop/storylets/work.yaml
- id: first-job-offer
  icon: 💼
  trigger: event              # event | action
  chance: 4%                  # life event: absolute yearly roll
  when: age >= 16 and not has_occupation(job) and stat.smarts >= 30
  once: true
  text: "{player.first_name}, a local shop offers you a part-time job as a cashier."
  choices:
    - label: Accept
      outcomes:
        - weight: 80 + stat.looks / 5
          text: You start next week.
          effects:
            - start_occupation(job/cashier)
            - stat.happiness += 5
        - weight: 20
          text: The offer falls through.
          next: job-hunt-tips    # chained follow-up storylet
    - label: Decline
```

| Field | Meaning |
|---|---|
| `id`, `icon`, `tags` | Identity; optional icon (see Icons); free tags for grouping. |
| `trigger` | `event` (drawn at age-up) or `action` (offered in a menu). |
| `menu` | For actions: the menu path, `<top>` or `<top>/<submenu>`, where the top is one of `occupation`, `assets`, `relationships`, `activities` (see [screens](screens.md#menu-ids)). |
| `when` | Eligibility condition (boolean expression). |
| `chance` | Event that rolls independently each year at this probability. |
| `weight` | Event that competes for a flavour slot with this weight. An event has exactly one of `chance` or `weight`. |
| `once`, `cooldown`, `max_per_life` | Repeat limits. |
| `text` | Inline English, with `{placeholders}`. |
| `choices` | Zero or more. Each has `label`, optional `when`, and `outcomes`. With no choices, the storylet has a single `outcomes` list. |
| `outcomes` | Weighted list. Each has `weight`, optional `when`, `text`, `effects`, and optional `next`. |
| `next` | Storylet id opened immediately after this outcome, for multi-step scenes. |

## Year draw

At each age-up, after settlement (ADR 0003):

1. Every eligible event with `chance` rolls independently.
2. The Core then draws flavour slots (count from the manifest range) by `weight` from the eligible weighted events.
3. The yearly cap from the manifest limits the total. When the cap is reached, chance events are kept before flavour events, in id order.

## Expressions

One small custom language is used for `when`, `weight`, `chance`, and effect statements (ADR 0004).

- Literals: integers, percents (`2.5%`, compiled to basis points out of 10,000), strings, booleans, and content ids (`job/cashier`).
- Operators: `+ - * /`, `mod` (modulo; `%` is used only by percent literals), comparisons, `and or not`, `in`, and the ternary `a ? b : c`.
- Names: `age`, `money`, `stat.<id>`, `quality.<id>`, and scoped references inside storylets (for example `person.<field>` for a spawned person).
- Functions: a fixed whitelist (for example `min`, `max`, `clamp`, `has`, `has_occupation`, `owns`, `years_in`). No user-defined functions and no loops.
- Integer-only. `/` truncates toward zero. A constant zero divisor is a build error. At runtime, division by zero gives 0 and overflow clamps to the safe-integer range. Dev builds and the balance harness assert on both.
- No randomness inside expressions. Rolls happen only for `chance` and `weight`, and each roll site's RNG purpose key comes from the content id.

### Effect statements

Each statement maps to one effect in the closed Core set (ADR 0002):

```
stat.<id> += n | -= n | = n          quality.<id> += n | = v
money += n | -= n                    take_loan(principal, rate, years)
grant_asset(item-kind) | remove_asset(item-kind)
start_occupation(kind) | end_occupation(kind)
spawn_person(role, generator) as <name>
relationship(<person>).closeness += n
journal("text")                      die("cause")
```

## Text

- Inline English. Placeholders (`{player.first_name}`, `{money}`, or a person bound by `spawn_person(...) as <name>`) are checked at build time against what is in scope.
- Localization later extracts strings keyed by content id and field path. Keyed text is not required now.

## Icons

Optional `icon`: a literal emoji (Twemoji subset) or `gameicons/<author>/<name>`. Lucide ids are rejected in Packs. The build copies only referenced icons and writes the credits manifest ([Emoji and icon policy](https://github.com/jeiang/life-sim/issues/17)).

## Build checks

The Pack compiler (Node, at build time) fails on any of:

- YAML syntax errors, schema violations (TypeBox), or duplicate ids.
- Expressions that fail to parse, reference undeclared names, or have type errors (for example an integer where a boolean is needed).
- Undeclared Pack dependencies, or dangling ids in references, `next`, or effects.
- Unknown placeholders or unknown icons.
- Ids removed or renamed without a migration entry.

The output is one JSON bundle per Pack (validated content plus expression ASTs), the icon subset, and the credits manifest.
