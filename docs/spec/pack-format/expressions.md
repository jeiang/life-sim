# Pack format: expressions and effects

The expression language, 18+ text variants and effect statements. Part of the [Pack format](index.md).

## Expressions

One small custom language is used for `when`, `weight`, `chance`, and effect statements (ADR 0004).

- Literals: integers, percents (`2.5%`, compiled to basis points out of 10,000), strings, booleans, and content ids (`job/cashier`).
- Operators: `+ - * /`, `mod` (modulo; `%` is used only by percent literals), comparisons, `and or not`, `in`, and the ternary `a ? b : c`.
- Names (scope `person` also has `person.role` as a content id, `person.kin` as the player-facing kinship label (a string, `""` for no kin; bound people have `<name>.kin` too), `person.alive`, and the read-only `person.closeness`, the player's highest closeness to them across their role rows, 0 with no tie; bound people have `<name>.closeness` too): `age`, `money`, `uses_this_year` (storylets), `confined` (boolean, see [Confinement](content-kinds.md#confinement)), `stat.<id>`, `quality.<id>`, `loan.<field>` (`balance`, `payment`, `missed`) in storylets with `scope: loan`, and other scoped references inside storylets (for example `person.<field>` for a spawned person). Declared state containers add `world.<id>` (counters), `table.<id>.<key>` (the player's table cell) and, on scoped or bound people, `person.quality.<id>` / `person.table.<id>.<key>` (see [State containers](state.md)).
- Content kinds: `kind("<kind>", <id>).<field>` reads a field of an entry of a Pack-declared kind (`kind("countries", us).tax > 5`); see [Declared content kinds](kinds.md).
- Readables: a Pack's readables and slots are bare names (`when: not hiring_blocked`), and the closed aggregators `sum(...)`, `count(...)`, `max(...)`, `min(...)` range over a visible container (`table.<id>`, `people.quality.<id>`, `people.table.<id>.<key>`); see [Readables](readables.md).
- Functions: a fixed whitelist (for example `min`, `max`, `clamp`, `has`, `has_occupation`, `owns`, `years_in`, `in_group`, `years_in_group`, `has_remote_job()`: true while the player holds an occupation flagged `remote`, `role_closeness(role)`: average closeness to the living people the player holds that role toward, 0 with none (an aggregate over a role, unlike `person.closeness`, which reads one person); `count_role(role, min, max)`: living people the player holds that role toward with closeness in `[min, max]`, inclusive). `kin(person)`: the kinship id of a person to the subject (`""` for no kin); `is_kin(person, id)`: true when the person is that kinship id; `count_kin(id, min_age, max_age)`: living people of that kinship id aged `[min, max]`, inclusive; see [Kinship](#kinship)). No user-defined functions and no loops.
- Group checks: `in_group(g)` is true while the player holds an occupation whose `group` is `g`; `years_in_group(g)` sums completed years over every occupation in `g`, held or ended (0 if none; an occupation ended within its first year adds 0). `g` must be an exclusivity group declared by the Pack or a dependency: a bare word (`in_group(school)`) or, for hyphenated names, a string (`in_group("full-time")`). `end_group(g)` (an effect, same group argument rules) ends every occupation the subject currently holds in `g`, in the order held, moving each to history exactly as `end_occupation` does; it does nothing when none is held, and a Pack that does not own the jobs can use it once a required capability provides the group. It works in storylets, effect macros and hooks. There is no `ends_groups` field. Group names are not content ids, so the ids lock is unaffected.
- `remote: true` on an occupation kind marks work that can be done from anywhere; `has_remote_job()` reads it (Relocation uses it to decide whether a move ends the job).
- Person-scoped storylets that involve a romantic or age-sensitive tie guard on both sides of 18: `when: (age < 18) == (person.age < 18)`.
- Integer-only. `/` truncates toward zero. A constant zero divisor is a build error. At runtime, division by zero gives 0 and overflow clamps to the safe-integer range. Dev builds and the balance harness assert on both.
- No randomness inside expressions. Rolls happen only for `chance` and `weight`, and each roll site's RNG purpose key comes from the content id.

### Text variants for 18+ mode

`mature_text` on a storylet or an outcome, and `mature_label` on a choice, replace `text` / `label` in a life that began with the player's 18+ mode switch on. The switch is recorded in the life at its start (a leading `mature` choice log entry), never read live, so replay is unaffected by later changes to the setting. There is no `mature` expression name: using it in `when`, `weight`, `chance`, effects or a placeholder is a compile error ("unknown name 'mature'"). Variants take the same `{placeholders}` as the plain text.

### Effect statements

Each statement maps to one effect in the closed Core set (ADR 0002):

```
stat.<id> += n | -= n | = n          quality.<id> += n | = v
world.<id> += n | -= n | = n         table.<id>.<key> += n | -= n | = n
person.quality.<id> += n | = v       person.table.<id>.<key> += n | -= n | = n   (also <bound>.quality… / <bound>.table…)
money += n | -= n                    take_loan(loan-kind, principal)
grant_asset(item-kind) | remove_asset(item-kind)
start_occupation(kind) | end_occupation(kind) | end_group(group)
spawn_person(role, generator[, parent: <person>][, link: birth|adopted|step]) as <name>
relationship(<person>).closeness += n
move_to(city)                        move_out()
set_standard(standard)
relationship(<person>).role = role   (replaces all the player's role rows toward them; keeps the highest closeness)
move_in()                            merge_money()
schedule(storylet, after: a-b years[, person][, lineage: true])   unschedule(storylet)
reach_milestone(milestone)
set_gender(target, gender)           rename(target, generator)
journal("text")                      die("cause")
```

A `kind: generator` item in `people/` sets `first_names` (a list used for every gender, or `{ male: [...], female: [...] }` pools where non-binary people draw from both), `last_names` (optional: omit it for people with no family name, such as animals), `age`, optional `stats`, and an optional `gender`: a fixed value (`gender: female`) or integer weights (`gender: { male: 1, female: 3 }`; omitted genders weigh 0; default male 1, female 1). A spawned person's gender is drawn from these weights and their first name from that gender's pool, so a Pack can spawn a person of a chosen gender.

A generator may also set `qualities: { <id>: <value> }` for `scope: person` qualities visible to its Pack: a fixed integer or flag, or an inclusive `[min, max]` range drawn at spawn (so every person carries, say, a culture from their birth country; the player's generator sets the player's own values). Ranges draw after every older draw of the spawn, in quality id order, so adding `qualities` moves no other draw of that stream. The stored body flag `can_carry` is set at spawn: from the gender (female yes, male no; a nonbinary person draws it, one bit, last) or fixed by the generator's `can_carry: true | false`. It is the body, separate from gender identity: `set_gender` never changes it. Expressions read it as the boolean `player.can_carry`, `person.can_carry` and `<name>.can_carry`; it is never shown as "sex". A Pack can also give every generated person a weighted quality draw with `spawn_qualities` ([manifest](manifest.md)).

A Pack may also name a sequence of these statements and call it as `<pack>.<macro>(args)`; see [Effect macros](effects.md). A macro call is expanded at build time into the closed effects above.

`reach_milestone(id)` fires a Pack-declared [milestone](hooks.md#milestones) now, once per life; `milestone_reached(id)` is the boolean the life has reached it (usable in any `when`). Both take a bare milestone id (or a string), checked at build time against Core and `provides: milestones` ids.

`schedule(...)` queues a consequence and `unschedule(storylet)` cancels it; see [Scheduled consequences](storylets.md#scheduled-consequences). Because of the colon, a `schedule(...)` statement is quoted in YAML (`- "schedule(later, after: 2-4 years)"`). Both work inside effect macros and lifecycle hooks (a hook has no person in scope, so it can only schedule a storylet that has no `scope`).

`person.money += n | -= n` (only in `scope: person`) changes that person's money, not the player's; no other `person.*` name can be assigned.

`move_to(city)` puts the player in a city (family and everyone else stay); `move_in()` and `merge_money()` (in `scope: person`, bound to a partner) move a partner in and merge their money; `move_out()` ends living with parents (under 18 a guardian takes over instead, unless a 16-17 year old with a living parent rolls the Pack's `no_guardian` chance and lives on their own) and picks the starting standard of living; `set_standard(standard)` chooses one (ignored with parents).

`spawn_person` with a role whose last id segment is `child` takes two optional named arguments, after the role and generator and in this order. `parent: <person>` names the child's other birth parent (`person` or a name bound earlier by `spawn_person ... as`) and overrides the default; `link: adopted` or `link: step` sets the kind of every link the child gets, the player's own included (default `birth`). With no `parent:` the player and their living spouses are linked, or, when there is no living spouse, the player and their living partner (`.../partner` role; the lowest person id if several; exactly one). A non-child role with these arguments is a build error.

`unlist(person)` unlists one named person (`person`, or a name bound by `spawn_person ... as <name>`; no person in scope does nothing): a rehomed or lost pet. They stay in the world, alive and in the save, but leave the player's relationship lists and `count_role`, and no storylet binds them again ([Animals](content-kinds.md#animals)).

`set_will(mode)` makes or removes the player's will: `even` (the cash is split evenly among the children), `spouse` (all of it to the living spouse), `charity`, or `none` to remove it; `will_heir(person)` leaves all the cash to one named person (`person`, or a name bound by `spawn_person ... as <name>`; no person in scope does nothing). A later call replaces the earlier will. `has_will()` is true while one is made. The mode is a bare word checked at build time. The will is read at the player's death ([estate rule](../core-loop.md#the-estate)) and then cleared; see [the will](state.md#the-will).

`set_gender(target, gender)` sets the identity of `target` to `male`, `female` or `nonbinary` (bare words, checked at build time), and `rename(target, generator)` gives `target` a new first name drawn from that generator's pool for their current gender (the family name stays; the roll is a stream of its own, `rename/<generator>`, or the statement's key inside a lifecycle hook). `target` is `player` (the subject), `person` or a name bound by `spawn_person ... as <name>`; no person in scope does nothing. Both are closed effects, so they work in storylets, macros and hooks (`set_gender(player, female)` in a macro body), and both replay and round-trip saves: the gender and name are stored on the person, `can_carry` is not touched.

### The deceased

After a succession the dead player is readable, read-only, as `deceased.<field>` in any `when`, text and effect expression (the Pack declares nothing): `first_name`, `last_name`, `gender`, the pronouns (`deceased.subject`, `deceased.Subject`, ...), `age` (at death), `cause` (a string, the cause of death), `money` (cash at death, before debts and the estate split; printed as currency in text), `kin` (what they are to the player, from the player's position: `"father"`, `"mother"`, ...), `stat.<id>`, `quality.<id>` and `table.<id>.<key>` (their values at death). Before any succession (a founder) every field reads neutral: 0, a quality's default, or the empty string; a storylet that needs a deceased uses `trigger: succession`. `deceased` is a reserved name (no readable or spawned person can take it), and no `deceased.*` name can be assigned.

## Kinship

What one person is to another is derived by the Core from parent links up to great-grandparents ([ADR 0006](../../adr/0006-parent-links-derived-kinship.md)); a Pack declares nothing. The Core kinship ids, written bare in `is_kin` and `count_kin` (a bare word or a string; anything else is a build error that lists them): `parent`, `grandparent`, `great-grandparent`, `child`, `grandchild`, `great-grandchild`, `sibling`, `half-sibling`, `step-sibling`, `adopted-sibling`, `aunt-uncle`, `great-aunt-uncle`, `cousin`, `niece-nephew`, `step-parent`, `step-child`, `spouse`, `parent-in-law`, `sibling-in-law`, `child-in-law`. The `person` argument of `kin` and `is_kin` is `person` in a `scope: person` storylet, or a name bound by `spawn_person(...) as <name>`.

```
when: is_kin(person, grandparent) and person.alive
when: count_kin(parent, 20, 120) >= 2
- "quality.visits += is_kin(p, parent) ? 1 : 0"
```
