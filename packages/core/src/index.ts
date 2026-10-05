export const CORE_PACKAGE = "@life/core";

export * from "./expr/index.ts";
export { cyrb128, hash64, worldHash } from "./hash.ts";
export * from "./pack.ts";
export { Rng, streamFor } from "./rng.ts";
export * from "./sim/index.ts";
export * from "./state/index.ts";
