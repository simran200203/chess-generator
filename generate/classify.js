// @ts-check
/**
 * Move classification (§8). Continuous eval-derived labels, computed from the
 * tier-2 deep curve. Thresholds and the win% conversion match Lichess's scheme
 * (noted in the README). Pure and engine-free, so it is unit-tested.
 *
 * Drop = winPct(before) − winPct(after), from the mover's perspective, where
 * `before` is the best eval at the position and `after` is the eval of the
 * position the played move produced.
 */

import { winPct } from './score.js';

/** win%-drop thresholds and their glyphs (§8). */
export const THRESHOLDS = { blunder: 30, mistake: 20, inaccuracy: 10 };
export const GLYPH = {
  blunder: '??', mistake: '?', inaccuracy: '?!', brilliant: '!!', 'only-move': '□',
};

const ONLY_MOVE_GAP = 12; // win% by which the best must beat the 2nd best
const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

/**
 * Total material for one colour (kings excluded), from a FEN.
 * @param {string} fen
 * @param {'w'|'b'} color
 * @returns {number}
 */
export function material(fen, color) {
  const board = fen.trim().split(/\s+/)[0];
  let total = 0;
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const isWhite = ch === ch.toUpperCase();
    if ((color === 'w') === isWhite) total += PIECE_VALUE[ch.toUpperCase()] || 0;
  }
  return total;
}

const toSide = (cpWhite, side) => (side === 'w' ? cpWhite : -cpWhite);

/**
 * Classify each played move of a game.
 * @param {{ moves: string[], fens: string[] }} game
 * @param {import('./deep.js').DeepPosition[]} deep
 * @returns {({ kind: string, glyph: string, label: string, dropWinPct: number } | null)[]}
 */
export function classifyGame(game, deep) {
  const out = [];
  for (let k = 0; k < game.moves.length; k++) {
    const side = /** @type {'w'|'b'} */ (game.fens[k].split(/\s+/)[1]);
    const before = winPct(toSide(deep[k].cpWhite, side));
    const after = winPct(toSide(deep[k + 1].cpWhite, side));
    const drop = before - after;

    let kind = null;
    if (drop >= THRESHOLDS.blunder) kind = 'blunder';
    else if (drop >= THRESHOLDS.mistake) kind = 'mistake';
    else if (drop >= THRESHOLDS.inaccuracy) kind = 'inaccuracy';
    else if (isBrilliant(game, deep, k, side, before, after, drop)) kind = 'brilliant';
    else if (isOnlyMove(game, deep, k, side, before)) kind = 'only-move';

    out.push(kind ? { kind, glyph: GLYPH[kind], label: cap(kind.replace('-', ' ')), dropWinPct: drop } : null);
  }
  return out;
}

function isOnlyMove(game, deep, k, side, before) {
  if (game.moves[k] !== deep[k].bestMove || deep[k].secondCpWhite === null) return false;
  const second = winPct(toSide(deep[k].secondCpWhite, side));
  return before - second >= ONLY_MOVE_GAP;
}

/**
 * A sound sacrifice: over a 2-ply window (after the likely recapture) the mover
 * is down ≥2 points of material, the move is good, they weren't already
 * winning, and the eval holds. Heuristic — flagged as an approximation.
 */
function isBrilliant(game, deep, k, side, before, after, drop) {
  if (k + 2 > game.moves.length) return false; // need the reply position
  const matBefore = material(game.fens[k], side);
  const matAfter = material(game.fens[k + 2], side);
  const sacrificed = matBefore - matAfter >= 2;
  const good = drop < 8;
  const notAlreadyWinning = before < 80;
  const holds = after >= 50 && after >= before - 5;
  return sacrificed && good && notAlreadyWinning && holds;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
