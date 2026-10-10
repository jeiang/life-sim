import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CompileOutput } from "./compile.ts";
import { twemojiFile } from "./icons.ts";

/** `icons.json`: the icons Pack content references. */
export interface IconManifest {
  readonly twemoji: readonly {
    readonly emoji: string;
    readonly id: string;
    /** Relative to the build output directory. */
    readonly file: string;
    readonly usedBy: readonly string[];
  }[];
  /**
   * game-icons.net glyphs are listed but not vendored: no hermetic source exists in the
   * pnpm dependency set, so the web build must supply `file` before badges can render.
   */
  readonly gameicons: readonly {
    readonly ref: string;
    readonly author: string;
    readonly name: string;
    readonly file: null;
    readonly usedBy: readonly string[];
  }[];
}

/** `index.json`: bundles in dependency order. */
export interface BuildIndex {
  readonly packs: readonly {
    readonly id: string;
    readonly file: string;
  }[];
}

export function iconManifest(out: CompileOutput): IconManifest {
  const uses = [...out.icons.values()].sort((a, b) => (a.ref < b.ref ? -1 : 1));
  return {
    twemoji: uses
      .filter((u) => u.kind === "twemoji")
      .map((u) => ({
        emoji: u.emoji as string,
        id: u.stem as string,
        file: `icons/twemoji/${u.stem}.svg`,
        usedBy: [...u.usedBy].sort(),
      })),
    gameicons: uses
      .filter((u) => u.kind === "gameicons")
      .map((u) => ({
        ref: u.ref,
        author: u.author as string,
        name: u.name as string,
        file: null,
        usedBy: [...u.usedBy].sort(),
      })),
  };
}

/** Write bundles, `index.json`, `icons.json`, `credits.json` and the referenced Twemoji SVGs. */
export function writeOutput(out: CompileOutput, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "icons", "twemoji"), { recursive: true });
  const json = (name: string, v: unknown) =>
    writeFileSync(join(dir, name), `${JSON.stringify(v)}\n`);
  for (const b of out.bundles) json(`${b.id}.json`, b);
  json("index.json", {
    packs: out.bundles.map((b) => ({
      id: b.id,
      file: `${b.id}.json`,
    })),
  } satisfies BuildIndex);
  const icons = iconManifest(out);
  json("icons.json", icons);
  json("credits.json", out.credits);
  for (const t of icons.twemoji)
    copyFileSync(twemojiFile(t.id), join(dir, t.file));
}
