import type { World } from "../state/types.ts";
import { getPerson } from "../state/world.ts";
import { makeEnv, type Scope } from "./env.ts";
import type { PackIndex } from "./pack-index.ts";

/** Money in minor units as `$1,234.50` (symbol and digits come from the Pack manifest). */
export function formatMoney(
  minor: number,
  currency: { readonly symbol: string; readonly digits: number },
): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const unit = 10 ** currency.digits;
  const whole = Math.trunc(abs / unit);
  const frac = abs - whole * unit;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail =
    currency.digits > 0
      ? `.${String(frac).padStart(currency.digits, "0")}`
      : "";
  return `${neg ? "-" : ""}${currency.symbol}${grouped}${tail}`;
}

const MONEY_NAMES = new Set([
  "amount",
  "money",
  "loan.balance",
  "loan.payment",
  "living.cost",
  "asset.value",
  "asset.purchase_price",
]);

/**
 * Render `{placeholder}` text. Names resolve through the expression environment for `scope`;
 * money names print as currency; `{{` and `}}` are literal braces. Unknown names throw (the
 * pack compiler has already checked them).
 */
export function renderText(
  text: string,
  world: World,
  idx: PackIndex,
  scope: Scope,
): string {
  if (!text.includes("{") && !text.includes("}")) return text;
  const env = makeEnv(world, idx, scope);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === "{") {
      if (text[i + 1] === "{") {
        out += "{";
        i++;
        continue;
      }
      const end = text.indexOf("}", i);
      const name = text.slice(i + 1, end).trim();
      const v = env.get(name);
      out += MONEY_NAMES.has(name)
        ? formatMoney(v as number, idx.currency)
        : String(v);
      i = end;
    } else if (ch === "}" && text[i + 1] === "}") {
      out += "}";
      i++;
    } else out += ch;
  }
  return out;
}

/** Full name of a person, for journal lines. */
export function nameOf(world: World, id: number): string {
  const p = getPerson(world, id);
  return `${p.givenName} ${p.familyName}`;
}
