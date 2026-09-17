import type { CastValue } from "./types.js";

export type RandomBit = () => 0 | 1;

function secureRandomBit(): 0 | 1 {
  const value = new Uint8Array(1);
  crypto.getRandomValues(value);
  return ((value[0] ?? 0) & 1) as 0 | 1;
}

/** Simulate six throws of three fair coins, from the first line upward. */
export function simulateThreeCoinCasting(randomBit: RandomBit = secureRandomBit): readonly CastValue[] {
  return Array.from({ length: 6 }, () => {
    const total = 6 + randomBit() + randomBit() + randomBit();
    return total as CastValue;
  });
}
