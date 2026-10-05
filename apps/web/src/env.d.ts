/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "virtual:packs" {
  import type { PackBundle } from "@life/core";
  /** Compiled Pack bundles in dependency order. */
  export const bundles: readonly PackBundle[];
  /** Emoji to Twemoji SVG path, relative to the site base. */
  export const emojiFiles: Readonly<Record<string, string>>;
  export const credits: {
    readonly entries: readonly {
      readonly id: string;
      readonly name: string;
      readonly license: string;
      readonly licenseUrl: string;
      readonly source: string;
      readonly attribution: string;
      readonly usage: "content" | "chrome";
      readonly modified: boolean;
      readonly count: number;
    }[];
  };
}

/** Git short revision baked in at build time (LIFE_SIM_REV, or "dev"). */
declare const __BUILD_REV__: string;
