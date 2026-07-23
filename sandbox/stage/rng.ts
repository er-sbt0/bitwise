// Seeded randomness. Visual code may use the engine clock and real entropy, but
// a figure that wants to be *reproducible* — a scatter the learner can compare
// against the prose, a fixture the eval harness re-renders — reaches for this.
// (Graded answers must not use randomness at all; that boundary is enforced by
// the CAS re-check reading static answer-spec literals, not by this module.)

export type Rng = (() => number) & {
  /** Uniform in [a, b). */
  range(a: number, b: number): number;
  /** Uniform integer in [a, b] inclusive. */
  int(a: number, b: number): number;
  /** Standard normal (Box–Muller). */
  normal(mean?: number, sd?: number): number;
  /** A uniformly chosen element. */
  pick<T>(items: readonly T[]): T;
};

/**
 * mulberry32 — 32 bits of state, one multiply-xorshift round. Fast, passes
 * gjrand's basic suite, and short enough to trust by reading it.
 *
 *   const rnd = makeRng(7)
 *   rnd()                 // 0.0 … 1.0
 *   rnd.range(-2, 2)
 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;

  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.normal = (mean = 0, sd = 1) => {
    // u avoids log(0); the second Box–Muller output is discarded rather than
    // cached, so a call count maps 1:1 onto the seed stream.
    const u = 1 - next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  next.pick = (items) => items[Math.min(items.length - 1, Math.floor(next() * items.length))];

  return next;
}
