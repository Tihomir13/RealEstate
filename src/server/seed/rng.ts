/** Deterministic RNG (mulberry32) so seed data is identical across restarts. */

export type Rng = () => number;

export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(label: string): Rng {
  return mulberry32(hashSeed(label));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Weighted pick: weights need not sum to 1. */
export function pickWeighted<T>(rng: Rng, items: readonly [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

export function randBetween(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randBetween(rng, min, max + 1));
}

/** Approx normal(0,1) via sum of uniforms. */
export function randNormal(rng: Rng): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rng();
  return (s - 3) / Math.sqrt(0.5);
}
