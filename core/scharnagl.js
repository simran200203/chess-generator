// @ts-check
/**
 * Scharnagl numbering: bijection between position IDs (0–959) and back-rank
 * strings. Standard chess (RNBQKBNR) is ID 518.
 *
 * Derivation (id → back rank), all divisions integer:
 *   1. id % 4  → light-square bishop, among files {b,d,f,h}
 *   2. / 4 % 4 → dark-square bishop,  among files {a,c,e,g}
 *   3. / 4 % 6 → queen, on the q-th remaining empty square
 *   4. / 6     → 0..9, selects the two knight squares from the KRN table
 *   5. the final three empty squares fill R,K,R left-to-right, which
 *      structurally guarantees the king sits between the rooks.
 */

import { validateBackRank } from './backrank.js';

/**
 * The ten placements of two knights among five remaining squares, in the
 * canonical Scharnagl order. Each entry is a pair of 0-based indices into the
 * list of empty squares that remain after the bishops and queen are placed.
 * @readonly
 */
const KNIGHT_TABLE = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [1, 2], [1, 3], [1, 4],
  [2, 3], [2, 4],
  [3, 4],
];

/**
 * Indices of squares still empty (null) in a partial back rank.
 * @param {(string|null)[]} squares
 * @returns {number[]}
 */
function emptyIndices(squares) {
  const out = [];
  for (let i = 0; i < 8; i++) if (squares[i] === null) out.push(i);
  return out;
}

/**
 * Convert a Scharnagl position ID to its back-rank string.
 * @param {number} id - integer in [0, 959]
 * @returns {string} 8-char back rank, e.g. 518 → "RNBQKBNR"
 */
export function idToBackRank(id) {
  if (!Number.isInteger(id) || id < 0 || id > 959) {
    throw new Error(`position ID must be an integer in [0, 959], got ${id}`);
  }

  /** @type {(string|null)[]} */
  const squares = new Array(8).fill(null);

  let n = id;
  const b1 = n % 4; n = Math.floor(n / 4); // light-square bishop
  const b2 = n % 4; n = Math.floor(n / 4); // dark-square bishop
  const q = n % 6; n = Math.floor(n / 6);  // queen among remaining empties
  const krn = n;                           // 0..9

  // Light squares are files b,d,f,h → indices 1,3,5,7 = 2*b1 + 1.
  squares[2 * b1 + 1] = 'B';
  // Dark squares are files a,c,e,g → indices 0,2,4,6 = 2*b2.
  squares[2 * b2] = 'B';

  // Queen on the q-th of the six remaining empty squares.
  squares[emptyIndices(squares)[q]] = 'Q';

  // Knights from a single snapshot of the five remaining empties (both indices
  // reference the same snapshot, so order of assignment does not matter).
  const afterQueen = emptyIndices(squares);
  const [k1, k2] = KNIGHT_TABLE[krn];
  squares[afterQueen[k1]] = 'N';
  squares[afterQueen[k2]] = 'N';

  // Final three empties, left to right: rook, king, rook.
  const [i0, i1, i2] = emptyIndices(squares);
  squares[i0] = 'R';
  squares[i1] = 'K';
  squares[i2] = 'R';

  return squares.join('');
}

/**
 * Convert a back-rank string to its Scharnagl position ID (exact inverse of
 * {@link idToBackRank}). Throws with a specific message on an invalid rank.
 * @param {string} backRank
 * @returns {number} integer in [0, 959]
 */
export function backRankToId(backRank) {
  const { valid, errors } = validateBackRank(backRank);
  if (!valid) {
    throw new Error(`invalid back rank "${backRank}": ${errors.join('; ')}`);
  }

  const files = {};
  for (let i = 0; i < 8; i++) {
    const p = backRank[i];
    (files[p] ||= []).push(i);
  }

  // Bishops: identify which sits on a light (odd) file vs dark (even) file.
  const [bA, bB] = files.B;
  const lightFile = bA % 2 === 1 ? bA : bB;
  const darkFile = bA % 2 === 0 ? bA : bB;
  const b1 = (lightFile - 1) / 2; // inverse of 2*b1 + 1
  const b2 = darkFile / 2;        // inverse of 2*b2

  // Queen index among the six empties remaining after the bishops.
  /** @type {(string|null)[]} */
  const withoutBishops = [...backRank].map((c) => (c === 'B' ? 'B' : null));
  const q = emptyIndices(withoutBishops).indexOf(files.Q[0]);

  // Knight indices among the five empties remaining after bishops + queen.
  /** @type {(string|null)[]} */
  const withoutBQ = [...backRank].map((c) => (c === 'B' || c === 'Q' ? c : null));
  const empties = emptyIndices(withoutBQ);
  const kIdx = [empties.indexOf(files.N[0]), empties.indexOf(files.N[1])].sort(
    (a, z) => a - z,
  );
  const krn = KNIGHT_TABLE.findIndex(
    ([a, z]) => a === kIdx[0] && z === kIdx[1],
  );

  return b1 + 4 * (b2 + 4 * (q + 6 * krn));
}
