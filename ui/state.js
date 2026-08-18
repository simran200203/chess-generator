// @ts-check
/**
 * Setup state — the single source of truth all three input methods (drag, type,
 * randomise) write to, and all displays (board, dial, tri-rep, tray) read from.
 * A minimal subscribe/notify keeps them in sync (§9).
 */

/** Target piece multiset for one back rank. @readonly */
export const TARGET = { K: 1, Q: 1, R: 2, B: 2, N: 2 };

/** Tray display order, left to right. @readonly */
export const TRAY_ORDER = ['K', 'Q', 'R', 'B', 'N'];

/** @type {(string|null)[]} white back rank, file a→h; null = empty */
let squares = new Array(8).fill(null);
/** @type {'chess' | 'chess960'} */
let mode = 'chess960';
/** @type {number|null} last seed used by Randomise, surfaced in the UI */
let seed = null;

/** @type {Set<() => void>} */
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn();
}

/**
 * Register a listener; returns an unsubscribe function.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** @returns {(string|null)[]} a copy of the back rank */
export function getSquares() {
  return squares.slice();
}

/** @returns {'chess' | 'chess960'} */
export function getMode() {
  return mode;
}

/** @returns {number|null} */
export function getSeed() {
  return seed;
}

/** @param {'chess' | 'chess960'} m */
export function setMode(m) {
  mode = m;
  notify();
}

/** @param {number|null} s */
export function setSeed(s) {
  seed = s;
  notify();
}

/**
 * Replace the whole rank. Accepts an array or a string; pads/truncates to 8.
 * @param {(string|null)[] | string} next
 */
export function setSquares(next) {
  const arr = typeof next === 'string' ? [...next] : next.slice();
  squares = arr.slice(0, 8).map((c) => (c ? c : null));
  while (squares.length < 8) squares.push(null);
  notify();
}

/**
 * Set a single file.
 * @param {number} file - 0..7
 * @param {string|null} piece
 */
export function setSquare(file, piece) {
  squares[file] = piece;
  notify();
}

/** Empty the rank. */
export function clear() {
  squares = new Array(8).fill(null);
  seed = null;
  notify();
}

/**
 * Pieces still available to place. May go negative under a file if typing
 * over-placed a piece — callers clamp for display; validation reports it.
 * @returns {Record<string, number>}
 */
export function remaining() {
  /** @type {Record<string, number>} */
  const r = { ...TARGET };
  for (const p of squares) if (p && r[p] != null) r[p] -= 1;
  return r;
}

/** @returns {number} how many files are filled */
export function placedCount() {
  return squares.filter(Boolean).length;
}

/**
 * The back-rank string with a placeholder for empty files.
 * @param {string} [empty] - placeholder character
 * @returns {string}
 */
export function rankString(empty = '·') {
  return squares.map((c) => c || empty).join('');
}
