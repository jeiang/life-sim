import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const GAMEICON = /^gameicons\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/;

let twemojiDir: string | undefined;
let twemojiFiles: Set<string> | undefined;

export function twemojiRoot(): string {
  twemojiDir ??= dirname(
    createRequire(import.meta.url).resolve("@twemoji/svg/package.json"),
  );
  return twemojiDir;
}

function twemojiStems(): Set<string> {
  twemojiFiles ??= new Set(
    readdirSync(twemojiRoot())
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.slice(0, -4)),
  );
  return twemojiFiles;
}

export type IconResult =
  | { ok: true; kind: "twemoji"; ref: string; stem: string; emoji: string }
  | { ok: true; kind: "gameicons"; ref: string; author: string; name: string }
  | { ok: false; message: string };

const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Resolve a source `icon` to a normalized reference (`twemoji:<stem>` or `gameicons:<author>/<name>`).
 * A Twemoji stem is the lower-case hex codepoints joined by `-`, with `fe0f` dropped unless the file needs it.
 */
export function resolveIcon(raw: string): IconResult {
  const text = raw.trim();
  if (/^lucide[/:]/i.test(text)) {
    return {
      ok: false,
      message: `'${text}': Lucide icons are UI chrome only and are rejected in Packs; use an emoji or gameicons/<author>/<name>`,
    };
  }
  const g = GAMEICON.exec(text);
  if (g) {
    const [, author, name] = g as unknown as [string, string, string];
    return {
      ok: true,
      kind: "gameicons",
      ref: `gameicons:${author}/${name}`,
      author,
      name,
    };
  }
  const graphemes = [...SEGMENTER.segment(text)];
  if (
    graphemes.length === 1 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u0023\u002a0-9]\uFE0F?\u20E3/u.test(
      text,
    )
  ) {
    const cps = [...text].map((c) => (c.codePointAt(0) as number).toString(16));
    const stripped = cps.filter((c) => c !== "fe0f").join("-");
    for (const stem of [stripped, cps.join("-")]) {
      if (twemojiStems().has(stem)) {
        return {
          ok: true,
          kind: "twemoji",
          ref: `twemoji:${stem}`,
          stem,
          emoji: text,
        };
      }
    }
    return {
      ok: false,
      message: `unknown icon '${text}': not in the Twemoji set`,
    };
  }
  return {
    ok: false,
    message: `unknown icon '${text}': write a single emoji or gameicons/<author>/<name>`,
  };
}

export function twemojiFile(stem: string): string {
  return join(twemojiRoot(), `${stem}.svg`);
}
