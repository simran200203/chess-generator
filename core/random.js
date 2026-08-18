// @ts-check
/**
 * mulberry32 — a small, fast, seedable 32-bit PRNG. Written in-house so the
 * project stays dependency-free (§2) and every random choice is reproducible
 * from its seed (§6): the setup Randomise here, and the weighted move selection
 * of the generation phase later, share this one generator.
 *
 * @param {number} seed - any 32-bit unsigned integer
 * @returns {() => number} next() → float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Coerce arbitrary text to a 32-bit seed, or produce a fresh random one when
 * blank. The seed itself is the reproducibility anchor: once shown, re-entering
 * it regenerates the same result.
 *
 * @param {string} [text] - user-entered seed; blank/whitespace → random
 * @returns {number} a 32-bit unsigned integer seed
 */
export function coerceSeed(text) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') {
    // Entropy only for the seed value; everything downstream is deterministic.
    return (Math.random() * 0x100000000) >>> 0;
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  // Non-numeric text: fold characters into a 32-bit hash so any string works.
  let h = 2166136261 >>> 0;
  for (const ch of trimmed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
