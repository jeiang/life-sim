/**
 * TypeBox schemas for Pack source files (docs/spec/pack-format.md). The same objects are
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

export const QualitySchema = Type.Union([
  obj({
    id: Name,
    type: Type.Literal("int"),
    min: Type.Optional(Type.Integer()),
    max: Type.Optional(Type.Integer()),
    default: Type.Integer(),
  }),
  obj({
    id: Name,
    type: Type.Literal("flag"),
    default: Type.Boolean(),
  }),
]);

export const ManifestSchema = obj(
  {
    id: Type.String({ pattern: PACK_ID_PATTERN }),
    version: Type.Integer({ minimum: 1 }),
    depends: Type.Optional(
      Type.Array(Type.String({ pattern: PACK_ID_PATTERN })),
    ),
    currency: Type.Optional(
      obj({
        symbol: Type.String({ minLength: 1 }),
        digits: Type.Integer({ minimum: 0, maximum: 4 }),
      }),
    ),
    stats: Type.Optional(Type.Array(StatSchema)),
    qualities: Type.Optional(Type.Array(QualitySchema)),
    exclusivity: Type.Optional(Type.Array(Id)),
    year: Type.Optional(
      obj({
        slots: Type.Tuple(
          [Type.Integer({ minimum: 0 }), Type.Integer({ minimum: 0 })],
          { description: "Flavour slot count range [min, max]" },
        ),
        cap: Type.Integer({ minimum: 0 }),
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
    migrations: Type.Optional(
      obj({
        rename: Type.Optional(
          Type.Array(obj({ from: Type.String(), to: Type.String() })),
        ),
        remove: Type.Optional(
          Type.Array(
            obj({ id: Type.String(), fallback: Type.Optional(Type.String()) }),
          ),
        ),
      }),
    ),
  },
  "Pack manifest (pack.yaml)",
);

const Outcome = obj({
  weight: Type.Optional(Src),
  when: Type.Optional(Src),
  text: Type.Optional(Type.String()),
  effects: Type.Optional(Type.Array(Type.String())),
  next: Type.Optional(Ref),
});

const Choice = obj({
  label: Label,
  when: Type.Optional(Src),
  outcomes: Type.Optional(Type.Array(Outcome)),
});

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
    text: Type.Optional(Type.String()),
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
  },
  "Occupation kind",
);

export const ItemSchema = obj(
  {
    id: Id,
    label: Label,
    icon: Type.Optional(Icon),
    category: Type.String({ minLength: 1 }),
    price: Src,
    value: Src,
    requires: Type.Optional(Src),
    loan: Type.Optional(Ref),
  },
  "Item kind",
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

export const PeopleSchema = Type.Union(
  [
    obj({ kind: Type.Literal("role"), id: Id, label: Label }),
    obj({
      kind: Type.Literal("generator"),
      id: Id,
      first_names: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      last_names: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      age: Range,
      stats: Type.Optional(Type.Record(Name, Range)),
    }),
  ],
  { title: "People data: role or generator" },
);

const list = (item: TSchema, title: string) =>
  Type.Array(item, { title: `${title} (list)` });

/** Content directories and the schema of a file in each (a YAML list). */
export const FILE_SCHEMAS = {
  "pack.schema.json": ManifestSchema,
  "storylets.schema.json": list(StoryletSchema, "Storylets"),
  "occupations.schema.json": list(OccupationSchema, "Occupation kinds"),
  "items.schema.json": list(ItemSchema, "Item kinds"),
  "loans.schema.json": list(LoanSchema, "Loan kinds"),
  "people.schema.json": list(PeopleSchema, "People data"),
} as const;

export type Manifest = Static<typeof ManifestSchema>;
export type StoryletSrc = Static<typeof StoryletSchema>;
export type OccupationSrc = Static<typeof OccupationSchema>;
export type ItemSrc = Static<typeof ItemSchema>;
export type LoanSrc = Static<typeof LoanSchema>;
export type PeopleSrc = Static<typeof PeopleSchema>;
