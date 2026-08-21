// @ts-check
/**
 * Convergence loop (§7). Generate N candidate games at tier-1 (shallow, fast,
 * disposable), filter by target outcome, score survivors by the chosen
 * criterion, select one winner, then re-analyse only that winner at tier-2
 * (deep). Deep cost is paid once.
 *
 * The whole run is reproducible: candidate seeds are derived deterministically
 * from the top-level seed, so the same seed + constraints yields the same
 * winner.
 */

import { mulberry32 } from '../core/random.js';
import { generateGame } from './selfplay.js';
import {
  CRITERIA, winnerOf, matchesTarget, relaxSuggestion, computeHopelessPly, toWhiteCp,
} from './score.js';

/**
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {object} opts
 * @param {string} opts.startFen
 * @param {'white'|'black'|'draw'|'either'} opts.target
 * @param {number} opts.whiteStrength
 * @param {number} opts.blackStrength
 * @param {keyof typeof CRITERIA} opts.criterion
 * @param {number} opts.candidateCount
 * @param {number} opts.seed
 * @param {number} [opts.tier1Depth]
 * @param {number} [opts.tier2Depth]
 * @param {number} [opts.decisiveCp]
 * @param {number} [opts.decisiveTail]
 * @param {object} [hooks]
 * @param {(p: object) => void} [hooks.onProgress]
 * @param {() => boolean} [hooks.shouldCancel]
 * @returns {Promise<object>}
 */
export async function converge(engine, opts, hooks = {}) {
  const {
    startFen, target, whiteStrength, blackStrength, criterion, candidateCount, seed,
    tier1Depth = 8, tier2Depth = 16, decisiveCp = 800, decisiveTail = 6,
  } = opts;
  const onProgress = hooks.onProgress || (() => {});
  const shouldCancel = hooks.shouldCancel || (() => false);

  const scorer = CRITERIA[criterion];
  const master = mulberry32(seed);
  const tallies = { white: 0, black: 0, draw: 0, ceiling: 0, total: 0 };

  let best = null; // { game, score, winner }
  let cancelled = false;

  for (let i = 0; i < candidateCount; i++) {
    if (shouldCancel()) { cancelled = true; break; }

    const candidateSeed = Math.floor(master() * 0x100000000);
    const game = await generateGame(engine, {
      startFen, seed: candidateSeed, whiteStrength, blackStrength,
      depth: tier1Depth, decisiveCp, decisiveTail, shouldCancel,
    });

    tally(tallies, game.result);

    if (matchesTarget(game.result, target)) {
      const winner = winnerOf(game.result);
      const score = scorer.score(game, winner);
      if (!best || score > best.score) best = { game, score, winner };
    }

    onProgress({
      done: i + 1, total: candidateCount, qualifying: qualifyingCount(tallies, target),
      best, criterion, cancelled: false,
    });
  }

  if (!best) {
    return {
      ok: false, cancelled,
      reason: cancelled
        ? 'Cancelled before any qualifying game was found.'
        : relaxSuggestion(target, tallies),
      tallies,
    };
  }

  // Cancelled with a best-so-far: skip the (slow) deep pass, return tier-1 data.
  if (cancelled) {
    return {
      ok: true, cancelled: true,
      game: best.game, winner: best.winner, score: best.score, criterion,
      hopelessPly: best.game.hopelessPly, deepEvals: null, tallies, seed,
    };
  }

  // Tier-2: re-analyse the winner deeply, once, and recompute the hopeless ply
  // on the accurate curve for display.
  onProgress({ done: candidateCount, total: candidateCount, qualifying: qualifyingCount(tallies, target), best, criterion, phase: 'deep' });
  const deepEvals = [];
  for (let i = 0; i < best.game.fens.length; i++) {
    if (shouldCancel()) { cancelled = true; break; }
    const fen = best.game.fens[i];
    const lines = await engine.analyse(fen, { depth: tier2Depth, multipv: 1 });
    deepEvals.push(lines.length ? toWhiteCp(lines[0], fen.split(/\s+/)[1]) : (deepEvals[i - 1] ?? 0));
  }
  const deepHopelessPly = computeHopelessPly(deepEvals, decisiveCp, decisiveTail)
    ?? best.game.hopelessPly;

  return {
    ok: true, cancelled,
    game: best.game,
    winner: best.winner,
    score: best.score,
    criterion,
    hopelessPly: deepHopelessPly,
    deepEvals,
    tallies,
    seed,
  };
}

function tally(t, result) {
  t.total += 1;
  const w = winnerOf(result);
  if (w === 'w') t.white += 1;
  else if (w === 'b') t.black += 1;
  else if (result.type === 'ceiling') t.ceiling += 1;
  else t.draw += 1;
}

function qualifyingCount(t, target) {
  if (target === 'white') return t.white;
  if (target === 'black') return t.black;
  if (target === 'either') return t.white + t.black;
  if (target === 'draw') return t.draw;
  return 0;
}
