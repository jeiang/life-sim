import { readFileSync } from "node:fs";
import {
  type CompileOutput,
  compilePacks,
  formatDiagnostic,
  iconManifest,
  twemojiFile,
} from "@life/pack-tools";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:packs";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Compiles `packsDir` with the Pack compiler at build and dev time and exposes the result as
 * `virtual:packs` (bundles, emoji-to-SVG map, credits manifest). Referenced Twemoji SVGs are
 * emitted under `icons/twemoji/` (served by a dev middleware in `vite dev`). No network access.
 */
export function packs(options: { packsDir: string }): Plugin {
  let out: CompileOutput | undefined;

  const compile = (): CompileOutput => {
    const result = compilePacks(options.packsDir);
    if (!result.ok) {
      const lines = result.diagnostics.map((d) => formatDiagnostic(d));
      throw new Error(`Pack compilation failed:\n${lines.join("\n")}`);
    }
    return result;
  };
  const current = (): CompileOutput => {
    out ??= compile();
    return out;
  };

  return {
    name: "life-sim-packs",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const o = current();
      const emoji: Record<string, string> = {};
      for (const t of iconManifest(o).twemoji) emoji[t.emoji] = t.file;
      return [
        `export const bundles = ${JSON.stringify(o.bundles)};`,
        `export const emojiFiles = ${JSON.stringify(emoji)};`,
        `export const credits = ${JSON.stringify(o.credits)};`,
      ].join("\n");
    },
    generateBundle() {
      const { twemoji } = iconManifest(current());
      for (const t of twemoji) {
        this.emitFile({
          type: "asset",
          fileName: t.file,
          source: readFileSync(twemojiFile(t.id)),
        });
      }
    },
    configureServer(server) {
      server.watcher.add(options.packsDir);
      server.watcher.on("all", (_event, file) => {
        if (!file.startsWith(options.packsDir)) return;
        out = undefined;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        const m = /^\/icons\/twemoji\/([0-9a-f-]+)\.svg$/.exec(path);
        if (!m) return next();
        try {
          const body = readFileSync(twemojiFile(m[1] as string));
          res.setHeader("content-type", "image/svg+xml");
          res.end(body);
        } catch {
          next();
        }
      });
    },
  };
}
