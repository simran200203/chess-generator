// @ts-check
/**
 * Seeded, strength-weighted move selection (§6). Given the top-N engine moves
 * (MultiPV), a side's strength setting maps to a probability weight over the
 * ranked lines; a PRNG draw then picks one. Deliberately NOT Stockfish's Skill
 * Level, whose error injection cannot be seeded.
 *
 * Pure and DOM-free, so it is unit-tested without an engine.
 */

/**
 * Probability weights over `n` ranked moves for a given strength.
 *
 * `strength` is in [0, 1]: 1 always plays the best move; lower values give a
 * meaningful chance of a plausible inferior move (line 2 or 3). The best move
 * gets probability `strength`; the remaining `1 - strength` is split over the
 * other lines with a 2:1 geometric decay, renormalised to however many lines
 * actually exist.
 *
 * @param {number} strength - 0..1
 * @param {number} n - number of available moves (1..3 in practice)
 * @returns {number[]} weights of length n, summing to 1
 */
export function weightsForStrength(strength, n) {
  if (n <= 1) return [1];
  const s = Math.max(0, Math.min(1, strength));
  const weights = [s];
  // Geometric shares for the non-best lines: 1, 1/2, 1/4, …
  const shares = [];
  let share = 1;
  for (let i = 1; i < n; i++) { shares.push(share); share /= 2; }
  const shareSum = shares.reduce((a, b) => a + b, 0);
  for (const sh of shares) weights.push((1 - s) * (sh / shareSum));
  return weights;
}

/**
 * Pick an index from a weight vector using a PRNG draw in [0, 1).
 * @param {number[]} weights - need not be normalised
 * @param {number} r - PRNG output in [0, 1)
 * @returns {number} chosen index
 */
export function weightedPick(weights, r) {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const threshold = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (threshold < acc) return i;
  }
  return weights.length - 1; // guard against float drift
}
