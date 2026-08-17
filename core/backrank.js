// @ts-check
/**
 * Chess960 back-rank strings: validation and square-colour helpers.
 *
 * A back-rank string is 8 characters from {R,N,B,Q,K}, files a→h.
 * This module owns validation of that representation — no DOM, no engine.
 */

/**
 * Canonical, specific validation messages. Exported so callers (and tests)
 * reference the exact string rather than duplicating literals that drift.
 * @readonly
 */
export const ERRORS = {
  length: 'back rank must be exactly 8 characters',
  chars: 'back rank may only contain the letters R, N, B, Q, K',
  rooks: 'back rank must contain exactly two rooks',
  knights: 'back rank must contain exactly two knights',
  bishops: 'back rank must contain exactly two bishops',
  queens: 'back rank must contain exactly one queen',
  kings: 'back rank must contain exactly one king',
  bishopColor: 'bishops must be on opposite-coloured squares',
  kingBetweenRooks: 'king must be between the two rooks',
};

/**
 * Colour of a rank-1 square by file index. a1 is dark, matching FEN/standard
 * chess. The bishop-opposite-colour rule is orientation-independent, but we
 * fix a1 = dark so the standard start (bishops on c1 dark, f1 light) validates.
 * @param {number} file - 0-based file index, a=0 … h=7
 * @returns {'dark' | 'light'}
 */
export function squareColor(file) {
  return file % 2 === 0 ? 'dark' : 'light';
}

/**
 * Count occurrences of a piece letter in a string.
 * @param {string} str
 * @param {string} ch
 * @returns {number}
 */
function count(str, ch) {
  let n = 0;
  for (const c of str) if (c === ch) n++;
  return n;
}

/**
 * Validate a Chess960 back-rank string against all four structural rules,
 * returning a specific message for each broken rule (never a generic failure).
 *
 * @param {string} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBackRank(input) {
  /** @type {string[]} */
  const errors = [];
  const str = typeof input === 'string' ? input : '';

  // Format gates first — structural checks below assume a well-formed string.
  if (str.length !== 8) errors.push(ERRORS.length);
  if (!/^[RNBQK]*$/.test(str)) errors.push(ERRORS.chars);
  if (errors.length) return { valid: false, errors };

  // Piece multiset: exactly 2R, 2N, 2B, 1Q, 1K.
  const nR = count(str, 'R');
  const nN = count(str, 'N');
  const nB = count(str, 'B');
  const nQ = count(str, 'Q');
  const nK = count(str, 'K');
  if (nR !== 2) errors.push(ERRORS.rooks);
  if (nN !== 2) errors.push(ERRORS.knights);
  if (nB !== 2) errors.push(ERRORS.bishops);
  if (nQ !== 1) errors.push(ERRORS.queens);
  if (nK !== 1) errors.push(ERRORS.kings);

  // Bishops on opposite colours — only meaningful with exactly two bishops.
  if (nB === 2) {
    const files = [];
    for (let i = 0; i < 8; i++) if (str[i] === 'B') files.push(i);
    if (squareColor(files[0]) === squareColor(files[1])) {
      errors.push(ERRORS.bishopColor);
    }
  }

  // King strictly between the rooks — only meaningful with 1 king and 2 rooks.
  if (nK === 1 && nR === 2) {
    const k = str.indexOf('K');
    const r1 = str.indexOf('R');
    const r2 = str.lastIndexOf('R');
    if (!(k > r1 && k < r2)) errors.push(ERRORS.kingBetweenRooks);
  }

  return { valid: errors.length === 0, errors };
}
