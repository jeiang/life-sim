// Fails when a production build carries any e2e-only hook. Usage: node check-prod-bundle.ts <dist>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  "__life",
  "playFixedLives",
  "e2e-chain",
  "setStreamOverride",
  "ScriptedRng",
  "forceRolls",
  "FORCED RUN",
];
const dist = process.argv[2];
if (!dist) throw new Error("usage: check-prod-bundle.ts <dist dir>");

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );

const hits = files(dist).flatMap((f) => {
  if (!/\.(js|html|css|webmanifest|json)$/.test(f)) return [];
  const text = readFileSync(f, "utf8");
  return FORBIDDEN.filter((s) => text.includes(s)).map((s) => `${f}: ${s}`);
});
if (hits.length > 0) {
  console.error(`e2e hooks found in the production build:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`production build in ${dist} has no e2e hooks`);
