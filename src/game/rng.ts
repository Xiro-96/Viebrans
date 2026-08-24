/** Deterministischer PRNG (mulberry32) — reproduzierbare Welten und Bots. */
let state = 0x9e3779b9;

export function seed(n: number): void {
  state = n >>> 0;
}

export function rng(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rint(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function chance(p: number): boolean {
  return rng() < p;
}
