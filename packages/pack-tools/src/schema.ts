/**
 * TypeBox schemas for Pack source files (docs/spec/pack-format/). The same objects are
 * exported as JSON Schema into `packages/pack-tools/schema/` for yaml-language-server.
 */
import { type Static, type TSchema, Type } from "@sinclair/typebox";

/** Ids: short form inside a Pack. Hyphenated ids must be namespaced inside expressions. */
export const ID_PATTERN = "^[a-z][a-z0-9_-]*$";
export const PACK_ID_PATTERN = "^[a-z][a-z0-9-]*$";
/** Stat and quality ids appear after a dot in expressions, so no hyphens. */
export const NAME_PATTERN = "^[a-z][a-z0-9_]*$";

const Id = Type.String({ pattern: ID_PATTERN, description: "Content id" });
/** A reference: short id (own Pack) or `<pack>/<id>`. */
const Ref = Type.String({
  pattern: "^([a-z][a-z0-9-]*/)?[a-z][a-z0-9_-]*$",
  description: "Content id reference: `<id>` in the same Pack or `<pack>/<id>`",
});
const Name = Type.String({ pattern: NAME_PATTERN });
const Icon = Type.String({
  description:
    "A literal emoji (Twemoji subset) or `gameicons/<author>/<name>`",
});
/** An expression source. YAML numbers and booleans are accepted and read as source text. */
const Src = Type.Union([Type.String(), Type.Integer(), Type.Boolean()], {
  description: "Expression in the Pack expression language (ADR 0004)",
});
const Range = Type.Tuple([Type.Integer(), Type.Integer()], {
  description: "Inclusive [min, max]",
});
const Label = Type.String({ minLength: 1 });

const obj = <T extends Record<string, TSchema>>(p: T, title?: string) =>
  Type.Object(p, { additionalProperties: false, ...(title ? { title } : {}) });

export const StatSchema = obj({
  id: Name,
  label: Label,
  icon: Type.Optional(Icon),
  start: Type.Tuple(
    [
      Type.Integer({ minimum: 0, maximum: 100 }),
      Type.Integer({ minimum: 0, maximum: 100 }),
    ],
    { description: "Inclusive start range within 0-100" },
  ),
});

const QualityScope = Type.Optional(
  Type.Literal("person", {
    description:
      "`person`: also readable and assignable on a bound person (`person.quality.<id>`); the player's own value is always `quality.<id>`",
  }),
);

export const QualitySchema = Type.Union([
  obj({
    id: Name,
    type: Type.Literal("int"),
    min: Type.Optional(Type.Integer()),
    max: Type.Optional(Type.Integer()),
    default: Type.Integer(),
    scope: QualityScope,
  }),
  obj({
    id: Name,
    type: Type.Literal("flag"),
    default: Type.Boolean(),
    scope: QualityScope,
  }),
]);

/**
 * `state/<topic>.yaml` (docs/spec/pack-format/state.md): pack-declared state containers the
 * engine persists, hashes and replays generically. `counter` is one world-wide value
 * (`world.<id>`); `table` is a per-person record of integers under closed keys
 * (`table.<id>.<key>`). A new container kind is a new member of this union.
 */
export const StateSchema = Type.Union([
  obj({
    id: Name,
    kind: Type.Literal("counter"),
    type: Type.Literal("int"),
    min: Type.Optional(Type.Integer()),
    max: Type.Optional(Type.Integer()),
    default: Type.Integer(),
  }),
  obj({
    id: Name,
    kind: Type.Literal("counter"),
    type: Type.Literal("flag"),
    default: Type.Boolean(),
  }),
  obj({
    id: Name,
    kind: Type.Literal("table"),
    keys: Type.Array(Name, {
      minItems: 1,
      uniqueItems: true,
      description: "Closed key set; a cell is `table.<id>.<key>`",
    }),
    min: Type.Optional(Type.Integer()),
    max: Type.Optional(Type.Integer()),
    default: Type.Integer({ description: "Value of every cell until written" }),
  }),
]);

/**
 * `readables/<topic>.yaml` (docs/spec/pack-format/readables.md): named read-only values the
 * Core computes from declared names each time they are read. `readable` names an expression
 * (with the closed aggregators `sum`, `count`, `max`, `min`), `slot` declares a readable other
 * Packs add terms to, and `contribute` adds one term to a slot. Ids are bare, like state.
 */
export const ReadableSchema = Type.Union([
  obj({
    kind: Type.Literal("readable"),
    id: Name,
    type: Type.Union([Type.Literal("int"), Type.Literal("bool")]),
    expr: Src,
  }),
  obj({
    kind: Type.Literal("slot"),
    id: Name,
    type: Type.Literal("int"),
    combine: Type.Optional(
      Type.Union([Type.Literal("sum"), Type.Literal("max")], {
        description:
          "How the default and the terms combine: summed (default) or maxed",
      }),
    ),
    default: Type.Integer({
      description: "Value with no terms; part of the sum or max otherwise",
    }),
  }),
  obj({
    kind: Type.Literal("slot"),
    id: Name,
    type: Type.Literal("bool"),
    default: Type.Boolean({
      description: "Value with no true term; true when any term is true",
    }),
  }),
  obj({
    kind: Type.Literal("contribute"),
    slot: Name,
    expr: Src,
  }),
]);

const PERCENT = "^(100|[0-9]{1,2})(\\.[0-9]{1,2})?%$";

/** A repeat curve; every field is optional because a storylet overrides the manifest's field by field. */
const repeatCurve = (what: string) =>
  obj(
    {
      full: Type.Optional(
        Type.Integer({
          minimum: 0,
          description: "Uses per year that give the full effect",
        }),
      ),
      reduced: Type.Optional(
        Type.Integer({
          minimum: 0,
          description:
            "Uses per year up to which gains are reduced; later uses give none",
        }),
      ),
      factor: Type.Optional(
        Type.String({
          pattern: PERCENT,
          description:
            "Share of each gain kept in the reduced range, for example `25%`",
        }),
      ),
    },
    what,
  );

/** Manifest blocks that only one loaded Pack may declare; the owner provides it as a capability `singletons` entry. */
export const SINGLETONS = [
  "year",
  "family",
  "npc_careers",
  "living",
  "repeat",
  "currency",
  "exclusivity",
] as const;

/** A capability id: `<pack>/<feature>`, the feature being the file stem in `capabilities/`. */
export const CAPABILITY_PATTERN = "^[a-z][a-z0-9-]*/[a-z][a-z0-9_-]*$";

const provided = (what: string, pattern: string) =>
  Type.Optional(
    Type.Array(Type.String({ pattern }), {
      uniqueItems: true,
      description: `Bare ids of ${what} this feature exports (block list, one id per line)`,
    }),
  );

/**
 * `packs/<id>/capabilities/<feature>.yaml` (docs/spec/pack-format/manifest.md). One file per feature;
 * lists are block lists, one entry per line, so concurrent edits merge cleanly.
 */
export const CapabilitySchema = obj(
  {
    provides: Type.Optional(
      obj({
        stats: provided("stats", NAME_PATTERN),
        qualities: provided("qualities", NAME_PATTERN),
        state: provided("state containers", NAME_PATTERN),
        readables: provided("readables and slots", NAME_PATTERN),
        groups: provided("exclusivity groups", ID_PATTERN),
        tags: provided("storylet tags", ID_PATTERN),
        milestones: provided("milestones", ID_PATTERN),
        roles: provided("people roles", ID_PATTERN),
        generators: provided("people generators", ID_PATTERN),
        cities: provided("cities", ID_PATTERN),
        occupations: provided("occupation kinds", ID_PATTERN),
        items: provided("item kinds and markets", ID_PATTERN),
        loans: provided("loan kinds", ID_PATTERN),
        standards: provided("standards of living", ID_PATTERN),
        storylets: provided("storylets", ID_PATTERN),
        singletons: Type.Optional(
          Type.Array(Type.Union(SINGLETONS.map((n) => Type.Literal(n))), {
            uniqueItems: true,
            description:
              "Singleton manifest blocks this Pack owns (block list); exactly one Pack declares and provides each",
          }),
        ),
      }),
    ),
    requires: Type.Optional(
      Type.Array(Type.String({ pattern: CAPABILITY_PATTERN }), {
        uniqueItems: true,
        description:
          "Capabilities (`<pack>/<feature>`) of other Packs this feature uses (block list, one id per line)",
      }),
    ),
  },
  "Capability",
);

export const ManifestSchema = obj(
  {
    id: Type.String({ pattern: PACK_ID_PATTERN }),
    namespace: Type.Optional(
      Type.String({
        pattern: "^[a-z][a-z0-9]*$",
        description:
          "Id prefix: every stat and quality this Pack declares starts with `<namespace>_`. Unique across Packs; not enforced for core-loop",
      }),
    ),
    currency: Type.Optional(
      obj({
        symbol: Type.String({ minLength: 1 }),
        digits: Type.Integer({ minimum: 0, maximum: 4 }),
      }),
    ),
    stats: Type.Optional(Type.Array(StatSchema)),
    exclusivity: Type.Optional(Type.Array(Id)),
    repeat: Type.Optional(
      repeatCurve("Default diminishing-returns curve for repeatable actions"),
    ),
    year: Type.Optional(
      obj({
        slots: Type.Tuple(
          [Type.Integer({ minimum: 0 }), Type.Integer({ minimum: 0 })],
          { description: "Flavour slot count range [min, max]" },
        ),
        cap: Type.Integer({ minimum: 0 }),
        decisions: Type.Optional(
          Type.Array(
            Type.String({
              pattern: "^(100|[0-9]{1,2})(\\.[0-9]{1,2})?%$",
              description: "Probability of at least this many decisions",
            }),
            {
              minItems: 1,
              description:
                "Decision slots: chance of at least 1, 2, 3, ... decisions in a year (non-increasing percents)",
            },
          ),
        ),
        decisions_min_age: Type.Optional(
          Type.Integer({
            minimum: 0,
            description: "Age reached from which decision slots roll",
          }),
        ),
        quiet: Type.Optional(
          Type.Array(Type.String({ minLength: 1 }), {
            minItems: 1,
            description:
              "Neutral journal lines for a year with no events; one is picked per quiet year",
          }),
        ),
      }),
    ),
    family: Type.Optional(
      obj(
        {
          player: Type.Optional(
            Type.Union([Ref], {
              description: "Generator whose names the player is drawn from",
            }),
          ),
          parent: obj({
            role: Ref,
            generator: Ref,
            count: Type.Integer({ minimum: 0 }),
          }),
          sibling: obj({ role: Ref, generator: Ref, count: Range }),
        },
        "Starting family",
      ),
    ),
    npc_careers: Type.Optional(
      obj(
        {
          roles: Type.Array(Ref, {
            minItems: 1,
            description:
              "Roles the player holds toward people who get a simulated career",
          }),
          start_age: Type.Integer({ minimum: 0 }),
          retire_age: Type.Integer({ minimum: 0 }),
          group: Type.String({
            minLength: 1,
            description: "Exclusivity group of the jobs NPCs hold",
          }),
          retired: Type.Optional(
            Type.Union([Ref], {
              description: "Occupation kind started at retirement",
            }),
          ),
          hire: Type.String({
            pattern: PERCENT,
            description:
              "Yearly chance an unemployed person with a work history is hired",
          }),
          promotion: Type.String({
            pattern: PERCENT,
            description:
              "Yearly chance of a promotion once `promotion_years` are served",
          }),
          job_loss: Type.String({
            pattern: PERCENT,
            description: "Yearly chance of losing the job",
          }),
          tiers: Type.Array(Type.Integer({ minimum: 1 }), {
            description:
              "Ascending yearly-income thresholds in minor units; the income tier is how many are reached",
          }),
          education: Type.Optional(
            Type.Array(
              obj({
                quality: Type.String({ minLength: 1 }),
                chance: Type.String({
                  pattern: PERCENT,
                }),
                needs: Type.Optional(Type.String({ minLength: 1 })),
              }),
              {
                description:
                  "Flag qualities rolled once when a career starts, in order; `needs` names a flag that must already be true",
              },
            ),
          ),
        },
        "NPC careers",
      ),
    ),
    living: Type.Optional(
      obj(
        {
          default: Ref,
          housing_share: Type.String({
            pattern: "^(100|[0-9]{1,2})(\\.[0-9]{1,2})?%$",
            description:
              "Share of the living cost an owned home in the current city removes, as a percent literal",
          }),
          home_category: Type.String({
            minLength: 1,
            description: "Item kind category that counts as a home",
          }),
          household: Type.Optional(
            obj(
              {
                dependent_role: Ref,
                dependent_cost: Type.Integer({
                  minimum: 0,
                  description:
                    "Base yearly cost per dependent living at home in minor units, before the city cost index",
                }),
                partner_role: Ref,
                partner_share: Type.String({
                  pattern: "^(100|[0-9]{1,2})(\\.[0-9]{1,2})?%$",
                  description:
                    "Share of the standard's cost a partner who moved in pays, as a percent literal",
                }),
                guardian_roles: Type.Array(Ref, {
                  description:
                    "Roles a guardian is drawn from (an adult relative); the first living one is named in the journal",
                }),
              },
              "Household costs and guardians",
            ),
          ),
        },
        "Living costs",
      ),
    ),
  },
  "Pack manifest (pack.yaml)",
);

/**
 * `packs/<id>/migrations/<name>.yaml` (docs/spec/pack-format/saves.md). One file per migration; its
 * id is `<pack>/<name>`. Saves record the ids they have applied. Lists are block lists, so
 * concurrent edits merge cleanly.
 */
export const MigrationSchema = obj(
  {
    rename: Type.Optional(
      Type.Array(obj({ from: Type.String(), to: Type.String() })),
    ),
    remove: Type.Optional(
      Type.Array(
        obj({ id: Type.String(), fallback: Type.Optional(Type.String()) }),
      ),
    ),
  },
  "Pack migration (migrations/<name>.yaml)",
);

const Outcome = obj({
  weight: Type.Optional(Src),
  when: Type.Optional(Src),
  text: Type.Optional(Type.String()),
  mature_text: Type.Optional(
    Type.String({
      description:
        "Replaces `text` in a life begun with 18+ mode on (chosen at life start, never read live)",
    }),
  ),
  effects: Type.Optional(Type.Array(Type.String())),
  next: Type.Optional(Ref),
});

const Choice = obj({
  label: Label,
  mature_label: Type.Optional(
    Type.String({
      minLength: 1,
      description: "Replaces `label` in a life begun with 18+ mode on",
    }),
  ),
  when: Type.Optional(Src),
  outcomes: Type.Optional(Type.Array(Outcome)),
});

const Amount = obj(
  {
    min: Src,
    max: Src,
    step: Type.Optional(Src),
  },
  "Amount input (actions only): the player picks money from `min` to `max` in `step`s (default 1); `amount` is bound in choice and outcome `when`, `weight`, effects and text",
);

export const StoryletSchema = obj(
  {
    id: Id,
    label: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          "Actions only: the menu label; default derived from the id",
      }),
    ),
    icon: Type.Optional(Icon),
    tags: Type.Optional(Type.Array(Type.String())),
    trigger: Type.Union([Type.Literal("event"), Type.Literal("action")]),
    menu: Type.Optional(
      Type.String({
        pattern:
          "^(occupation|assets|relationships|activities)(/[a-z][a-z0-9_-]*)?$",
        description: "Actions only: `<top>` or `<top>/<submenu>`",
      }),
    ),
    scope: Type.Optional(
      Type.Union([Type.Literal("loan"), Type.Literal("person")]),
    ),
    target: Type.Optional(
      Type.Array(Ref, {
        minItems: 1,
        description:
          "`scope: person` only: role ids the bound person must have toward the player",
      }),
    ),
    when: Type.Optional(Src),
    chance: Type.Optional(Src),
    weight: Type.Optional(Src),
    once: Type.Optional(Type.Boolean()),
    cooldown: Type.Optional(Type.Integer({ minimum: 1 })),
    max_per_life: Type.Optional(Type.Integer({ minimum: 1 })),
    repeatable: Type.Optional(
      Type.Boolean({
        description:
          "Actions only: may be done many times a year with diminishing returns; excludes `cooldown`",
      }),
    ),
    repeat: Type.Optional(
      repeatCurve("Overrides the manifest's repeat curve for this action"),
    ),
    text: Type.Optional(Type.String()),
    amount: Type.Optional(Amount),
    mature_text: Type.Optional(
      Type.String({
        description:
          "Replaces `text` in a life begun with 18+ mode on (chosen at life start, never read live)",
      }),
    ),
    choices: Type.Optional(Type.Array(Choice)),
    outcomes: Type.Optional(Type.Array(Outcome)),
  },
  "Storylet",
);

export const OccupationSchema = obj(
  {
    id: Id,
    label: Label,
    icon: Type.Optional(Icon),
    group: Id,
    ladder: Type.Optional(Type.String()),
    requires: Type.Optional(Src),
    pay: Src,
    duration_years: Type.Optional(Type.Integer({ minimum: 1 })),
    promotes_to: Type.Optional(Ref),
    promotion_years: Type.Optional(Type.Integer({ minimum: 1 })),
    loan: Type.Optional(Ref),
    remote: Type.Optional(
      Type.Boolean({
        description:
          "The work can be done from anywhere; `has_remote_job()` is true while one is held",
      }),
    ),
    npc: Type.Optional(
      Type.Literal(false, {
        description:
          "`false`: never assigned to an NPC career (creator, prison and similar special occupations)",
      }),
    ),
    provides_housing: Type.Optional(
      Type.Boolean({
        description:
          "While held, no living cost is charged and the standard's effects do not apply (for example prison)",
      }),
    ),
    confines: Type.Optional(
      obj(
        {
          menus: Type.Optional(
            Type.Boolean({
              description:
                "Lock action menus and the shop except actions tagged `custody-ok`",
            }),
          ),
          events: Type.Optional(
            Type.Boolean({
              description:
                "Lock yearly events except those tagged `custody-ok`",
            }),
          ),
        },
        "Confinement (prison, hospital): while held the player is `confined`, housing is provided, and only content tagged `custody-ok` runs where locked",
      ),
    ),
  },
  "Occupation kind",
);

const Percent = Type.String({
  pattern: "^\\d+(\\.\\d{1,2})?%$",
  description: "A percent literal, for example `2.5%`",
});
const SignedPercent = Type.String({
  pattern: "^-?\\d+(\\.\\d{1,2})?%$",
  description: "A percent literal that may be negative, for example `-1.5%`",
});

const MarketSchema = obj(
  {
    start: Type.Integer({
      minimum: 1,
      description: "Starting price of one whole unit, minor units",
    }),
    drift: SignedPercent,
    vol: Percent,
    beta: Type.Optional(
      obj(
        {
          of: Ref,
          factor: SignedPercent,
        },
        "Follows another market kind: its yearly return times `factor` is added",
      ),
    ),
    crash: Type.Optional(
      obj(
        { chance: Percent, drop: Percent },
        "Yearly chance of a crash that takes `drop` off the return",
      ),
    ),
    jump: Type.Optional(
      obj(
        { chance: Percent, multiple: Type.Integer({ minimum: 2 }) },
        "Yearly chance the price is multiplied by `multiple`",
      ),
    ),
    delist: Type.Optional(
      Type.String({
        pattern: "^\\d+(\\.\\d{1,2})?%$",
        description: "Yearly chance the price falls to 0 for good",
      }),
    ),
    bond: Type.Optional(
      obj(
        {
          term: Type.Integer({ minimum: 1, description: "Years to maturity" }),
          coupon: Percent,
          default: Percent,
          loss: Type.Optional(Percent),
        },
        "Government bond: `coupon` yearly on the principal, principal back at maturity, `default` is the yearly issuer default chance and `loss` the share of principal lost (default 100%)",
      ),
    ),
  },
  "Market block: the kind is traded by amount (`trade`) instead of bought, and has a price series per world year",
);

export const ItemSchema = obj(
  {
    id: Id,
    label: Label,
    icon: Type.Optional(Icon),
    category: Type.String({ minLength: 1 }),
    price: Type.Optional(Src),
    value: Type.Optional(Src),
    requires: Type.Optional(Src),
    loan: Type.Optional(Ref),
    market: Type.Optional(MarketSchema),
  },
  "Item kind. A kind with `market` has no `price`, `value` or `loan`; any other has `price` and `value`",
);

export const LoanSchema = obj(
  {
    id: Id,
    label: Label,
    icon: Type.Optional(Icon),
    rate: Type.String({
      pattern: "^\\d+(\\.\\d{1,2})?%$",
      description: "Yearly rate as a percent literal, for example `6.5%`",
    }),
    term_years: Type.Integer({ minimum: 1 }),
    down_payment: Type.Optional(
      Type.String({
        pattern: "^\\d+(\\.\\d{1,2})?%$",
        description:
          "Share of the price paid in cash up front, as a percent literal, for example `20%`; default `0%`",
      }),
    ),
    secured: Type.Optional(Type.Boolean()),
  },
  "Loan kind",
);

export const CitySchema = obj(
  {
    id: Id,
    label: Label,
    icon: Type.Optional(Icon),
    cost_index: Type.String({
      pattern: "^\\d+(\\.\\d{1,2})?%$",
      description:
        "Cost of living relative to the baseline, as a percent literal, for example `130%`",
    }),
    weight: Type.Integer({
      minimum: 1,
      description: "Relative weight when a life picks its birth city",
    }),
    wage_index: Type.Optional(
      Type.String({
        pattern: "^\\d+(\\.\\d{1,2})?%$",
        description:
          "Pay multiplier for working here, as a percent literal (default `100%`); read by pay expressions as `city.wage_index`",
      }),
    ),
    country: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          "Country the city belongs to, a plain string for now (no country content type yet)",
      }),
    ),
  },
  "City",
);

export const StandardSchema = obj(
  {
    id: Id,
    label: Label,
    icon: Type.Optional(Icon),
    cost: Type.Integer({
      minimum: 0,
      description:
        "Base yearly cost in minor units, before the city cost index (0 for homeless)",
    }),
    happiness: Type.Integer({ description: "Yearly change to happiness" }),
    health: Type.Integer({ description: "Yearly change to health" }),
    cap: Type.Optional(
      Type.Integer({
        minimum: 0,
        maximum: 100,
        description:
          "Positive happiness and health changes stop at this stat value (default 100)",
      }),
    ),
    risk: Type.String({
      pattern: "^\\d+(\\.\\d{1,2})?%$",
      description:
        "Multiplier for illness and death chances as a percent literal (100% is neutral); read as `living.risk`",
    }),
  },
  "Standard of living",
);

const NameList = Type.Array(Type.String({ minLength: 1 }), { minItems: 1 });
const GenderName = Type.Union([
  Type.Literal("male"),
  Type.Literal("female"),
  Type.Literal("nonbinary"),
]);

export const PeopleSchema = Type.Union(
  [
    obj({ kind: Type.Literal("role"), id: Id, label: Label }),
    obj({
      kind: Type.Literal("generator"),
      id: Id,
      first_names: Type.Union(
        [NameList, obj({ male: NameList, female: NameList })],
        {
          description:
            "A list for every gender, or `{ male, female }` pools (non-binary people draw from both)",
        },
      ),
      gender: Type.Optional(
        Type.Union(
          [
            GenderName,
            obj({
              male: Type.Optional(Type.Integer({ minimum: 0 })),
              female: Type.Optional(Type.Integer({ minimum: 0 })),
              nonbinary: Type.Optional(Type.Integer({ minimum: 0 })),
            }),
          ],
          {
            description:
              "Fixed gender, or draw weights per gender (default male 1, female 1)",
          },
        ),
      ),
      last_names: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      age: Range,
      stats: Type.Optional(Type.Record(Name, Range)),
      jobs: Type.Optional(
        Type.Array(
          obj({
            label: Label,
            tier: Type.Integer({
              minimum: 0,
              description:
                "Static income tier, 0 up to the number of `npc_careers.tiers`",
            }),
          }),
          {
            minItems: 1,
            description:
              "Static job labels with income tiers; a spawned person gets one at random (no simulated career)",
          },
        ),
      ),
    }),
  ],
  { title: "People data: role or generator" },
);

const list = (item: TSchema, title: string) =>
  Type.Array(item, { title: `${title} (list)` });

/** Content directories and the schema of a file in each (a YAML list). */
export const FILE_SCHEMAS = {
  "pack.schema.json": ManifestSchema,
  "capability.schema.json": CapabilitySchema,
  "qualities.schema.json": list(QualitySchema, "Qualities"),
  "state.schema.json": list(StateSchema, "State containers"),
  "readables.schema.json": list(ReadableSchema, "Readables"),
  "migration.schema.json": MigrationSchema,
  "storylets.schema.json": list(StoryletSchema, "Storylets"),
  "occupations.schema.json": list(OccupationSchema, "Occupation kinds"),
  "items.schema.json": list(ItemSchema, "Item kinds"),
  "loans.schema.json": list(LoanSchema, "Loan kinds"),
  "cities.schema.json": list(CitySchema, "Cities"),
  "standards.schema.json": list(StandardSchema, "Standards of living"),
  "people.schema.json": list(PeopleSchema, "People data"),
} as const;

export type Capability = Static<typeof CapabilitySchema>;
export type Migration = Static<typeof MigrationSchema>;
export type Manifest = Static<typeof ManifestSchema>;
export type StoryletSrc = Static<typeof StoryletSchema>;
export type OccupationSrc = Static<typeof OccupationSchema>;
export type ItemSrc = Static<typeof ItemSchema>;
export type LoanSrc = Static<typeof LoanSchema>;
export type CitySrc = Static<typeof CitySchema>;
export type StandardSrc = Static<typeof StandardSchema>;
export type PeopleSrc = Static<typeof PeopleSchema>;
export type Quality = Static<typeof QualitySchema>;
export type State = Static<typeof StateSchema>;
export type Readable = Static<typeof ReadableSchema>;
