// @ts-check
/**
 * Single self-play game generation (§6). From a start position, each ply is
 * chosen from the engine's MultiPV-3 candidates by a seeded, strength-weighted
 * draw. An identical seed (with the same start position and strengths)
 * reproduces an identical game.
 *
 * No convergence loop, criteria, or move classification — those are phase 7/8.
 */

import { mulberry32 } from '../core/random.js';
import { weightsForStrength, weightedPick } from './selection.js';

/**
 * @typedef {object} SelfPlayResult
 * @property {string} startFen
 * @property {number} seed
 * @property {number} whiteStrength
 * @property {number} blackStrength
 * @property {string[]} moves - engine UCI, in order
 * @property {{ type: 'checkmate'|'stalemate'|'fifty-move'|'ceiling', winner?: 'w'|'b' }} result
 */

/**
 * Play one complete game from a position.
 *
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {object} opts
 * @param {string} opts.startFen
 * @param {number} opts.seed - 32-bit seed
 * @param {number} [opts.whiteStrength] - 0..1 (default 0.85)
 * @param {number} [opts.blackStrength] - 0..1 (default 0.85)
 * @param {number} [opts.depth] - search depth per move (default 8, tier 1)
 * @param {number} [opts.multipv] - candidates per move (default 3)
 * @param {number} [opts.plyCeiling] - hard safety cap, not user-facing (default 300)
 * @param {(ply: number, fen: string) => void} [opts.onPly] - progress callback
 * @returns {Promise<SelfPlayResult>}
 */
export async function generateGame(engine, opts) {
  const {
    startFen, seed,
    whiteStrength = 0.85, blackStrength = 0.85,
    depth = 8, multipv = 3, plyCeiling = 300,
    onPly,
  } = opts;

  await engine.newGame(); // reset hash to a known state for reproducibility
  const rng = mulberry32(seed);

  let fen = startFen;
  /** @type {string[]} */
  const moves = [];
  /** @type {SelfPlayResult['result']} */
  let result = { type: 'ceiling' };

  while (moves.length < plyCeiling) {
    const lines = await engine.analyse(fen, { depth, multipv });

    // No candidate moves → the side to move is mated or stalemated.
    if (lines.length === 0 || !lines[0].pv[0]) {
      const active = /** @type {'w'|'b'} */ (fen.split(/\s+/)[1]);
      const { checkers } = await engine.describe(fen);
      result = checkers.length
        ? { type: 'checkmate', winner: active === 'w' ? 'b' : 'w' }
        : { type: 'stalemate' };
      break;
    }

    const active = fen.split(/\s+/)[1];
    const strength = active === 'w' ? whiteStrength : blackStrength;
    const weights = weightsForStrength(strength, lines.length);
    const idx = weightedPick(weights, rng());
    const move = lines[idx].pv[0];

    moves.push(move);
    fen = await engine.applyMoves(fen, [move]);
    if (onPly) onPly(moves.length, fen);

    // Fifty-move rule (halfmove clock is the 5th FEN field).
    if (Number(fen.split(/\s+/)[4] || 0) >= 100) { result = { type: 'fifty-move' }; break; }
  }

  return { startFen, seed, whiteStrength, blackStrength, moves, result };
}
