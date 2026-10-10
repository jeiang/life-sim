# Pack format: storylets and the year draw

Storylets, repeatable actions and the yearly event draw. Part of the [Pack format](index.md).

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
| `id`, `icon`, `tags` | Identity; optional icon (see Icons); free tags for grouping. `custody-ok` is a Core-owned tag: see [Confinement](content-kinds.md#confinement). `wager` marks a storylet in which the player risks money; the balance harness reports its realised return. |
| `trigger` | `event` (drawn at age-up) or `action` (offered in a menu). |
| `menu` | For actions: the menu path, `<top>` or `<top>/<submenu>`, where the top is one of `occupation`, `assets`, `relationships`, `activities` (see [screens](screens.md#menu-ids)). |
| `scope` | Optional binding, evaluated once per bound item. `loan` (events only): once per loan the player holds, with `loan` bound (for example a missed-payment event). `person`: once per non-player person during the NPC yearly pass, with `person` bound (NPC storylets); on an action, the UI offers it for a chosen person. `die(...)` kills the bound person, and `relationship(person).closeness += n` changes the tie to them. Without `scope`, only the player and storylet-local names are in scope. |
| `target` | With `scope: person`: role ids the person must hold toward the player (for example `[core-loop/parent]`). `person.role`, `person.alive` and `person.age` are readable. |
| `when` | Eligibility condition (boolean expression). |
| `chance` | Event that rolls independently each year at this probability. |
| `weight` | Event that competes for a flavour slot with this weight. An event has exactly one of `chance` or `weight`. |
| `once`, `cooldown`, `max_per_life` | Repeat limits. |
| `repeatable`, `repeat` | Actions only. `repeatable: true` lets the action be done many times a year with diminishing returns (see Repeatable actions); it has no `cooldown`. `repeat` overrides the manifest curve field by field. |
| `amount` | Actions only: `{ min, max, step }`, integer expressions over the player (`step` defaults to 1, below 1 counts as 1), evaluated when the menu lists the action. The player picks an amount (money, minor units) from the shared picker before the action runs. `amount` is then bound in choice and outcome `when`, `weight`, effects and text (`{amount}` renders as money), and in no other field, including the storylet's own `when`, `text` and the range expressions. An action whose `min` exceeds the player's money is disabled. `next` does not carry the amount, so the compiler rejects a `next` that targets a storylet with an `amount`. See ADR 0005. |
| `text` | Inline English, with `{placeholders}`. |
| `choices` | Zero or more. Each has `label`, optional `when`, and `outcomes`. With no choices, the storylet has a single `outcomes` list. |
| `outcomes` | Weighted list. Each has `weight`, optional `when`, `text`, `effects`, and optional `next`. |
| `next` | Storylet id opened immediately after this outcome, for multi-step scenes. |

## Repeatable actions

A normal action is limited by `once`, `cooldown` or `max_per_life`. An action with `repeatable: true` has no `cooldown` (a build error) and stays selectable all year; its returns diminish instead. The Core counts uses per action storylet per year, and per bound person for `scope: person` actions (time with Mom and time with Dad count separately). The counters are life state (`World.uses`), reset at every age-up, rebuilt by replaying the choice log and part of the world hash.

With the curve `{ full: F, reduced: R, factor: P }`:

| Use in the year | Gains kept |
|---|---|
| 1 to F | all |
| F+1 to R | P (default 25%) |
| R+1 and later | none |

Only **gains** shrink: positive `stat.x += n` (and `-= -n`) deltas and positive `relationship(p).closeness +=` deltas, each rounded toward zero. Money never scales (pay, prizes and costs apply in full), nor do costs, negative deltas, quality changes, `stat.x = n`, flags, journal lines, spawned people or any other effect, so repeating never gets safer. A storylet chained with `next` (also across a choice, and in a saved pending choice) keeps the factor of the repeatable action that led to it, so its gains shrink at the same use count; a chained storylet that is itself repeatable takes the smaller of the two factors.

From use F+1 the Core adds "You are getting tired of this." to the outcome text; from use R+1 it adds "It no longer helps this year." Packs can write their own with `uses_this_year`.

`uses_this_year` (integer, readable in any storylet expression and text) is the number of uses of this storylet (and person) so far this year. In `when` it is the count before this use; once the action opens (its `text`, outcome `when`/`weight`/`text`/effects) it includes the current use, so the 11th use reads 11. It is 0 for non-repeatable storylets.

## Year draw

At each age-up, after settlement (ADR 0003):

1. Every eligible event with `chance` rolls independently.
2. If the manifest declares `year.decisions`, the Core draws **decision slots** (below). Choice events (storylets with `choices`) then no longer compete for flavour slots; they come only from chance rolls and decision slots.
3. The Core then draws flavour slots (count from the manifest range) by `weight` from the eligible weighted events.
4. The yearly cap from the manifest limits the total. When the cap is reached, chance events are kept first, then decisions, then flavour events. If the chance hits alone exceed the cap, the survivors are a uniform random choice among the hits (purpose keys `year/chance-cap/<i>`), not id order, so no Pack is favoured; they are then delivered in id order. Nothing is drawn when the hits fit under the cap. The balance harness reports the chance events dropped by the cap per Pack.

### Decision slots

`year.decisions` is the list of "at least" probabilities: `[90%, 50%, 30%]` means P(at least 1 decision) = 90%, P(at least 2) = 50%, P(at least 3) = 30%. Probabilities must not increase. `year.decisions_min_age` (default 0) is the age reached from which slots roll; before it there are no decision slots.

Slots chain. Slot 1 fires with probability p1. Slot k rolls only if slot k-1 fired, and fires with probability p_k / p_(k-1) (slot 2: 50/90, slot 3: 30/50), so the run of fired slots reaches k with probability exactly p_k. Each roll has its own stable RNG purpose key, `decision-slot/<k>`.

Choice events that hit in the chance pass count toward the fired slots. Each remaining fired slot draws one eligible choice event with a `weight` (respecting `when`, `once`, `cooldown`, `max_per_life`; no storylet twice in a year; purpose key `decision-pick/<n>`). A fired slot with nothing eligible stays empty. Chance events can add decisions beyond the slots, so the delivered 'at least' rates are never below the targets.

The queued decisions open one after another: the player resolves each (and its `next:` chain) and the next opens. The life cannot age up until the queue is empty.
