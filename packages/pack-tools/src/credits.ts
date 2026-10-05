/** Credits manifest, rendered by the Credits screen under settings (issue #17). */
export interface CreditEntry {
  readonly id: string;
  readonly name: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly source: string;
  readonly attribution: string;
  /** Why it appears: used by Pack content, or always (UI chrome). */
  readonly usage: "content" | "chrome";
  /** True when the glyphs were changed (game-icons are recoloured). */
  readonly modified: boolean;
  readonly count: number;
}

export interface CreditsManifest {
  readonly entries: readonly CreditEntry[];
}

const CC3 = "https://creativecommons.org/licenses/by/3.0/";
const CC4 = "https://creativecommons.org/licenses/by/4.0/";

export function buildCredits(
  twemojiCount: number,
  gameicons: ReadonlyMap<string, number>,
): CreditsManifest {
  const entries: CreditEntry[] = [];
  if (twemojiCount > 0) {
    entries.push({
      id: "twemoji",
      name: "Twemoji",
      license: "CC BY 4.0",
      licenseUrl: CC4,
      source: "https://github.com/jdecked/twemoji",
      attribution: "Graphics copyright Twitter, Inc and other contributors",
      usage: "content",
      modified: false,
      count: twemojiCount,
    });
  }
  for (const author of [...gameicons.keys()].sort()) {
    entries.push({
      id: `gameicons/${author}`,
      name: `game-icons.net: ${author}`,
      license: "CC BY 3.0",
      licenseUrl: CC3,
      source: `https://game-icons.net/tags/${author}.html`,
      attribution: `Icons by ${author} on game-icons.net; modified (recoloured)`,
      usage: "content",
      modified: true,
      count: gameicons.get(author) ?? 0,
    });
  }
  entries.push(
    {
      id: "lucide",
      name: "Lucide",
      license: "ISC",
      licenseUrl: "https://github.com/lucide-icons/lucide/blob/main/LICENSE",
      source: "https://lucide.dev",
      attribution:
        "Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT); all other copyright (c) for Lucide are held by Lucide Contributors 2022",
      usage: "chrome",
      modified: false,
      count: 0,
    },
    {
      id: "feather",
      name: "Feather",
      license: "MIT",
      licenseUrl: "https://github.com/feathericons/feather/blob/main/LICENSE",
      source: "https://feathericons.com",
      attribution: "Copyright (c) 2013-2017 Cole Bemis",
      usage: "chrome",
      modified: false,
      count: 0,
    },
  );
  return { entries };
}
