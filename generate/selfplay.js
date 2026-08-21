// @ts-check
/**
 * Single self-play game generation (§6, extended for §7). Each ply is chosen
 * from the engine's MultiPV-3 candidates by a seeded, strength-weighted draw.
 * The game also records the data the convergence loop scores on: a White-POV
 * eval per position, the win% each move conceded, and the FEN per ply.
 *
 * A game is "decisive" once the eval stays past ±decisiveCp for one side; the
 * ply at which that first trips is the hopeless ply (a first-class output). We
 * then play on `decisiveTail` more plies so the game has a real ending, not a
 * cut-off, before stopping. Draws are detected by threefold repetition,
 * insufficient material, and the fifty-move rule.
 */

import { mulberry32 } from '../core/random.js';
import { weightsForStrength, weightedPick } from './selection.js';
import { cpFromScore, toWhiteCp, winPct } from './score.js';
import { repetitionKey, insufficientMaterial } from './rules.js';

/**
 * @typedef {object} SelfPlayGame
 * @property {string} startFen
 * @property {number} seed
 * @property {number} whiteStrength
 * @property {number} blackStrength
 * @property {string[]} moves - engine UCI, in order
 * @property {string[]} fens - fens[0] = start, fens[i] = after i plies
 * @property {number[]} evals - White-POV centipawns per position (tier-1)
 * @property {{side:'w'|'b', dropWinPct:number}[]} plies - per move played
 * @property {{type:'checkmate'|'stalemate'|'fifty-move'|'threefold'|'insufficient'|'decisive'|'ceiling', winner?:'w'|'b'}} result
 * @property {number|null} hopelessPly - ply the position first became lost
 * @property {number} finalPly - total plies played
 */

/**
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {object} opts
 * @param {string} opts.startFen
 * @param {number} opts.seed
 * @param {number} [opts.whiteStrength]
 * @param {number} [opts.blackStrength]
 * @param {number} [opts.depth] - tier-1 search depth (default 8)
 * @param {number} [opts.multipv] - default 3
 * @param {number} [opts.plyCeiling] - hard cap, not user-facing (default 300)
 * @param {number} [opts.decisiveCp] - decisive threshold (default 800)
 * @param {number} [opts.decisiveTail] - plies to play past the trip (default 6)
 * @param {() => boolean} [opts.shouldCancel] - consulted each ply
 * @returns {Promise<SelfPlayGame>}
 */
export async function generateGame(engine, opts) {
  const {
    startFen, seed,
    whiteStrength = 0.85, blackStrength = 0.85,
    depth = 8, multipv = 3, plyCeiling = 300,
    decisiveCp = 800, decisiveTail = 6,
    shouldCancel,
  } = opts;

  await engine.newGame();
  const rng = mulberry32(seed);

  let fen = startFen;
  /** @type {string[]} */ const moves = [];
  /** @type {string[]} */ const fens = [fen];
  /** @type {number[]} */ const evals = [];
  /** @type {{side:'w'|'b', dropWinPct:number}[]} */ const plies = [];
  const seen = new Map(); // repetition key -> count
  seen.set(repetitionKey(fen), 1);

  /** @type {SelfPlayGame['result']} */
  let result = { type: 'ceiling' };
  let hopelessPly = null;
  let lostSince = null; // ply index of the current sustained-loss run
  let lostSign = 0;

  while (moves.length < plyCeiling) {
    if (shouldCancel && shouldCancel()) { result = { type: 'ceiling' }; break; }

    const lines = await engine.analyse(fen, { depth, multipv });

    // Terminal: no candidate moves → mate or stalemate.
    if (lines.length === 0 || !lines[0].pv[0]) {
      const active = /** @type {'w'|'b'} */ (fen.split(/\s+/)[1]);
      const { checkers } = await engine.describe(fen);
      if (checkers.length) {
        result = { type: 'checkmate', winner: active === 'w' ? 'b' : 'w' };
        if (hopelessPly === null) hopelessPly = moves.length;
      } else {
        result = { type: 'stalemate' };
      }
      break;
    }

    const active = /** @type {'w'|'b'} */ (fen.split(/\s+/)[1]);
    const whiteCp = toWhiteCp(lines[0], active);
    evals.push(whiteCp); // eval of the position after moves.length plies

    // Decisive tracking on this position (reached after moves.length plies).
    const plyPos = moves.length;
    if (Math.abs(whiteCp) >= decisiveCp) {
      const s = Math.sign(whiteCp);
      if (lostSince === null || s !== lostSign) { lostSince = plyPos; lostSign = s; }
      if (plyPos - lostSince >= decisiveTail) {
        result = { type: 'decisive', winner: lostSign > 0 ? 'w' : 'b' };
        hopelessPly = lostSince;
        break;
      }
    } else {
      lostSince = null;
      lostSign = 0;
    }

    // Choose a move by seeded, strength-weighted draw over the candidates.
    const strength = active === 'w' ? whiteStrength : blackStrength;
    const weights = weightsForStrength(strength, lines.length);
    const idx = weightedPick(weights, rng());
    const move = lines[idx].pv[0];

    // Win% this move conceded relative to the best candidate.
    plies.push({
      side: active,
      dropWinPct: winPct(cpFromScore(lines[0])) - winPct(cpFromScore(lines[idx])),
    });

    moves.push(move);
    fen = await engine.applyMoves(fen, [move]);
    fens.push(fen);

    // Draw rules.
    const key = repetitionKey(fen);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count >= 3) { result = { type: 'threefold' }; break; }
    if (insufficientMaterial(fen)) { result = { type: 'insufficient' }; break; }
    if (Number(fen.split(/\s+/)[4] || 0) >= 100) { result = { type: 'fifty-move' }; break; }
  }

  return {
    startFen, seed, whiteStrength, blackStrength,
    moves, fens, evals, plies, result, hopelessPly, finalPly: moves.length,
  };
}
