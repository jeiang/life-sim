# relocation glossary

Terms owned by the relocation Pack. General vocabulary is in [packages/core/CONTEXT.md](../../packages/core/CONTEXT.md). Quality prefix: `reloc_`.

**Language skill**:
One int quality per language, `reloc_lang_<language>` (0-100): English (default 100), Spanish, French, German, Italian, Japanese, Mandarin, Korean (default 0). Provided by the `relocation/languages` capability, so any Pack may read them.
_Avoid_: Fluency (use Language skill)

**Study a language**:
The repeatable action `relocation/study-a-language` in the `activities/languages` submenu (age 6+). Seven choices, English left out because it starts at 100 and never falls. The gain tapers with skill and follows the repeat curve (3 full uses, then a quarter to 8) by hand because qualities are not scaled by the Core.

**Country**:
The content kind `reloc_country` (`code` 1 US, 2 Canada, 3 UK, 4 Japan, 5 Mexico; `language`). The kind `reloc_city_country` maps every city, the six core-loop cities and the eight below, to its country. Read it with `kind("reloc_city_country", ...)`.

**Abroad city**:
One of eight cities declared here with `weight: 0` (a destination, never a birth city): Toronto, Montreal, London, Manchester, Tokyo, Osaka, Mexico City, Guadalajara. `reloc_dest` is its index 0..7 in that order, and `city.wage_index` and `city.cost_index` carry the game-made pay and cost multipliers.

**Abroad**:
`quality.reloc_abroad`: the player lives in an abroad city. Set by arrival and by the rare abroad childhood move, cleared by moving home.

**Emigrate**:
`emigrate-apply` (age 18+, not enrolled, $3,000 fee, once a year) asks for a destination and chains `emigrate-decision`: an approval roll from smarts, a degree, years worked, money and earlier denials (5% to 95%). A denial keeps the fee and allows a retry next year. Approval chains `emigrate-job-fork`, then `relocation-arrive`.

**Job fork**:
`emigrate-job-fork` decides the job at any move (emigrating, moving home, moving between abroad cities, flagged by `reloc_job_fork`): no job and retirement pay continue, a remote-capable job survives when a boss roll passes, any other full-time or part-time job ends (`end_group`).

**Home**:
`reloc_home_city` (index of the core-loop city left, 1 dustwater to 6 goldcrest) and `reloc_home_country` (1, the US), recorded by the `remember_home` macro before every move abroad. `move-back-home` returns to that city for $1,500.

**Relatives left behind**:
While abroad, `relatives-drift` takes 6 closeness a year from each parent, sibling and friend (75% a year per person). `call-home` and `visit-home` (relationships menu) win it back; `relatives-reunion` adds 10 once, after the first age-up that follows moving home. There is no per-person location.

**Language friction**:
Abroad with under 20 skill in the destination language, the `hiring_blocked` slot is true (professional `apply-*` jobs refuse); under 40 the `abroad-language-barrier` event costs a happiness point a year. `abroad-language-growth` adds 3 skill a year in the destination language.

**Childhood move**:
`child-move-domestic` (0.8% a year, ages 5-17, living with parents) moves the family to another US city, or to the partner city of the same country when abroad; `child-move-abroad` (0.25%) takes the family abroad for good. `reloc_child_move_age` marks the year, and `childhood-friends-lose-touch` takes 3 closeness from a child friend that year.
