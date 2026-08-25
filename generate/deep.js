// @ts-check
/**
 * Tier-2 deep analysis of a full game — one accurate evaluation per position,
 * with the second-best line (for the "only move" heuristic) and the best move.
 * Shared by the convergence loop (winner re-analysis) and the Annotate action
 * (any game on the board).
 */

import { toWhiteCp, MATE_CP } from './score.js';

/**
 * @typedef {object} DeepPosition
 * @property {number} cpWhite - White-POV centipawns (mate mapped to ±MATE_CP)
 * @property {{type:'cp'|'mate', value:number}} evalWhite - pretty eval, White POV
 * @property {number|null} secondCpWhite - White-POV cp of the 2nd-best line
 * @property {string|null} bestMove - engine UCI of the best move
 */

/**
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {string[]} fens - one FEN per position (fens[i] = after i plies)
 * @param {{ depth?: number, multipv?: number, shouldCancel?: () => boolean, onStep?: (i:number,n:number)=>void }} [opts]
 * @returns {Promise<DeepPosition[]>}
 */
export async function deepAnalyse(engine, fens, opts = {}) {
  const { depth = 16, multipv = 2, shouldCancel, onStep } = opts;
  /** @type {DeepPosition[]} */
  const deep = [];
  for (let i = 0; i < fens.length; i++) {
    if (shouldCancel && shouldCancel()) break;
    const fen = fens[i];
    const side = fen.split(/\s+/)[1];
    const lines = await engine.analyse(fen, { depth, multipv });
    if (lines.length) {
      const best = lines[0];
      deep.push({
        cpWhite: toWhiteCp(best, side),
        evalWhite: best.scoreType === 'mate'
          ? { type: 'mate', value: (side === 'w' ? 1 : -1) * best.score }
          : { type: 'cp', value: toWhiteCp(best, side) },
        secondCpWhite: lines[1] ? toWhiteCp(lines[1], side) : null,
        bestMove: best.pv[0] || null,
      });
    } else {
      // Terminal position: mate (side to move is lost) or stalemate.
      const { checkers } = await engine.describe(fen);
      const mated = checkers.length > 0;
      deep.push({
        cpWhite: mated ? (side === 'w' ? -MATE_CP : MATE_CP) : 0,
        evalWhite: mated ? { type: 'mate', value: 0 } : { type: 'cp', value: 0 },
        secondCpWhite: null,
        bestMove: null,
      });
    }
    if (onStep) onStep(i + 1, fens.length);
  }
  return deep;
}
