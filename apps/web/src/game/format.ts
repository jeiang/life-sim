import { emojiFiles } from "virtual:packs";
import { formatMoney } from "@life/core";
import { packIndex } from "./store.ts";

export const money = (minor: number): string =>
  formatMoney(minor, packIndex.currency);

const BASE = import.meta.env.BASE_URL;

/** URL of the Twemoji SVG for an icon ref such as `twemoji:1f4bc`, or undefined for other kinds. */
export function iconUrl(ref: string | undefined): string | undefined {
  if (!ref?.startsWith("twemoji:")) return undefined;
  return `${BASE}icons/twemoji/${ref.slice("twemoji:".length)}.svg`;
}

const emojiList = Object.keys(emojiFiles).sort((a, b) => b.length - a.length);
const EMOJI_RE =
  emojiList.length > 0
    ? new RegExp(
        `(${emojiList.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
        "u",
      )
    : null;

/** Split text into plain strings and known emoji (odd indices are emoji). */
export function splitEmoji(text: string): string[] {
  return EMOJI_RE ? text.split(EMOJI_RE) : [text];
}

export function emojiUrl(emoji: string): string | undefined {
  const f = emojiFiles[emoji];
  return f ? `${BASE}${f}` : undefined;
}
