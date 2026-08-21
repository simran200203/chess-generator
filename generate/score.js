// @ts-check
/**
 * Convergence scoring (§7). Continuous, eval-derived metrics only — no discrete
 * move classification (that is phase 8). Pure and engine-free, so it is
 * unit-tested on synthetic games.
 *
 * A scored game exposes:
 *   evals    number[]  White-POV centipawns, one per position (index = ply)
 *   plies    {side, dropWinPct}[]  win% the mover conceded vs the best move
 *   result   {type, winner?}
 *   moves    string[]
 */

const MATE_CP = 100000;

/** Centipawns for a score line, from the scoring side's own perspective. */
export function cpFromScore(line) {
  if (line.scoreType === 'mate') {
    const sign = line.score > 0 ? 1 : line.score < 0 ? -1 : 1;
    return sign * (MATE_CP - Math.min(Math.abs(line.score), 100) * 10);
  }
  return line.score;
}

/** White-POV centipawns for a score line given the side to move. */
export function toWhiteCp(line, active) {
  const cp = cpFromScore(line);
  return active === 'w' ? cp : -cp;
}

/**
 * Win probability (0–100) for the side whose centipawns these are. Lichess's
 * logistic (§8), reused here for scoring only — not for labels.
 */
export function winPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * First ply index that begins a sustained run past ±threshold lasting at least
 * `tail` further plies — the point the position becomes hopeless. Null if no
 * such run exists. Recomputed on the deep (tier-2) curve for the displayed
 * value.
 * @param {number[]} evals - White-POV centipawns per position
 * @param {number} threshold
 * @param {number} tail
 * @returns {number|null}
 */
export function computeHopelessPly(evals, threshold, tail) {
  let since = null;
  let sign = 0;
  for (let i = 0; i < evals.length; i++) {
    const s = Math.sign(evals[i]);
    if (Math.abs(evals[i]) >= threshold) {
      if (since === null || s !== sign) { since = i; sign = s; }
      if (i - since >= tail) return since;
    } else {
      since = null;
      sign = 0;
    }
  }
  return null;
}

/** Winner of a game, or null for a draw / discarded game. */
export function winnerOf(result) {
  return result.type === 'checkmate' || result.type === 'decisive' ? result.winner : null;
}

const DRAW_TYPES = ['stalemate', 'fifty-move', 'threefold', 'insufficient'];

/** Does a game's result satisfy the target outcome? */
export function matchesTarget(result, target) {
  const w = winnerOf(result);
  if (target === 'white') return w === 'w';
  if (target === 'black') return w === 'b';
  if (target === 'either') return w === 'w' || w === 'b';
  if (target === 'draw') return DRAW_TYPES.includes(result.type);
  return false;
}

// --- Criterion scorers (higher score = selected) -------------------------

function largestSwing(game) {
  let max = 0;
  for (let i = 1; i < game.evals.length; i++) {
    max = Math.max(max, Math.abs(game.evals[i] - game.evals[i - 1]) / 100);
  }
  return max;
}

function cleanestWinner(game, winner) {
  let slip = 0;
  for (const p of game.plies) if (winner === null || p.side === winner) slip += p.dropWinPct;
  return -slip; // fewer conceded win% = cleaner = higher score
}

function shortestDecisive(game) {
  return -game.moves.length; // fewer plies = higher score
}

function mostGradual(game, winner) {
  const loser = winner === 'w' ? 'b' : winner === 'b' ? 'w' : null;
  const drops = game.plies
    .filter((p) => loser === null || p.side === loser)
    .map((p) => p.dropWinPct)
    .filter((d) => d > 0);
  const sum = drops.reduce((a, b) => a + b, 0);
  const sumSq = drops.reduce((a, b) => a + b * b, 0);
  return sumSq > 0 ? (sum * sum) / sumSq : 0; // participation ratio: how spread out
}

/**
 * Registry — adding a fifth criterion is one entry (§7).
 * @type {Record<string, {label:string, short:string, score:(g:any,w:any)=>number, format:(v:number)=>string}>}
 */
export const CRITERIA = {
  'largest-swing': {
    label: 'Largest swing', short: 'swing',
    score: largestSwing, format: (v) => v.toFixed(1),
  },
  'cleanest-winner': {
    label: 'Cleanest winner', short: 'clean',
    score: cleanestWinner, format: (v) => `${(-v).toFixed(0)}% slipped`,
  },
  'shortest-decisive': {
    label: 'Shortest decisive', short: 'length',
    score: shortestDecisive, format: (v) => `${-v} plies`,
  },
  'most-gradual': {
    label: 'Most gradual', short: 'gradual',
    score: mostGradual, format: (v) => `~${v.toFixed(1)} moves`,
  },
};

/**
 * Human sentence for the hopeless ply, matching the move-list numbering.
 * @param {number|null} ply - ply index (positions played) where it became lost
 * @returns {string}
 */
export function hopelessLabel(ply) {
  if (ply === null || ply === undefined || ply <= 0) return 'no clear losing point';
  const fullmove = Math.ceil(ply / 2);
  const side = ply % 2 === 1 ? 'White' : 'Black';
  return `Position becomes lost at move ${fullmove} (${side}), ply ${ply}.`;
}

/**
 * When nothing qualifies, name the constraint to relax based on what happened.
 * @param {string} target
 * @param {{white:number, black:number, draw:number, ceiling:number, total:number}} tallies
 * @returns {string}
 */
export function relaxSuggestion(target, tallies) {
  const { white, black, draw, ceiling, total } = tallies;
  const wins = white + black;
  if (target === 'draw') {
    return wins > draw
      ? `No draw in ${total} candidates — most games were decisive. Narrow the strength gap (make both sides closer in strength), or raise the candidate count.`
      : `No draw in ${total} candidates. Raise the candidate count, or narrow the strength gap so games balance out.`;
  }
  // A win target.
  const wanted = target === 'white' ? 'White' : target === 'black' ? 'Black' : 'either side';
  if (draw >= ceiling && draw > 0) {
    return `${wanted} did not win in ${total} candidates — ${draw} ended drawn. Widen the strength gap (lower the intended loser's strength), or raise the candidate count.`;
  }
  if (ceiling > 0) {
    return `${wanted} did not win in ${total} candidates — ${ceiling} ran to the ply ceiling without a decisive result. Widen the strength gap, or raise the candidate count.`;
  }
  if (target === 'white' && black > 0) {
    return `White did not win, but Black won ${black} of ${total}. Raise White's strength and lower Black's, or switch the target to "Black wins".`;
  }
  if (target === 'black' && white > 0) {
    return `Black did not win, but White won ${white} of ${total}. Raise Black's strength and lower White's, or switch the target to "White wins".`;
  }
  return `No qualifying game in ${total} candidates. Widen the strength gap, raise the candidate count, or change the target outcome.`;
}
