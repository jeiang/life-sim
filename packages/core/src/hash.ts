import { serializeWorld } from "./state/serialize.ts";
import type { World } from "./state/types.ts";

/**
 * Integer string hashes. Pure 32-bit arithmetic (Math.imul, >>> 0): identical on
 * every JS engine. Strings are hashed by UTF-16 code unit.
 */

const M32 = 0x100000000;

/**
 * cyrb128 (bryc, public domain): four 32-bit words from a string. Used to
 * derive RNG streams.
 */
export function cyrb128(
  str: string,
): readonly [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/**
 * 64-bit string hash (cyrb53 variant, two 32-bit lanes) as 16 lowercase hex
 * digits. Not cryptographic; for change detection and test snapshots.
 */
export function hash64(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return hex32(h2) + hex32(h1);
}

function hex32(n: number): string {
  return ((n >>> 0) + M32).toString(16).slice(1);
}

/** Stable 64-bit hash (16 hex digits) of the world's canonical serialization. */
export function worldHash(world: World): string {
  return hash64(serializeWorld(world));
}
