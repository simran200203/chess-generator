// @ts-check
/**
 * Workspace — minimal shell for phase 2. Shows the chosen starting position on
 * a static board with the tri-representation readout and Back / Reset nav. The
 * Analyse and Generate panels arrive in later phases (§9); the right panel here
 * is a deliberate placeholder.
 */

import { showScreen } from './router.js';
import { createBoard, buildPosition } from './board.js';
import {
  validateBackRank, backRankToId, backRankToFEN, toStandardCastling,
} from '../core/index.js';

/** @param {string} sel */
const $ = (sel, root = document) => root.querySelector(sel);

let board = null;
/** @type {string} */
let startRank = 'RNBQKBNR';
/** @type {'launch' | 'setup'} */
let cameFrom = 'launch';

/**
 * Initialise the workspace once.
 */
export function initWorkspace() {
  const root = $('#workspace');
  board = createBoard($('[data-role="board"]', root));

  $('[data-role="ws-back"]', root).addEventListener('click', () => {
    showScreen(cameFrom);
  });
  $('[data-role="ws-reset"]', root).addEventListener('click', () => {
    render(); // re-render the starting position (static in phase 2)
  });
}

/**
 * Render the workspace for a starting back rank and reveal the screen.
 * @param {string} backRank - valid 8-char white back rank
 * @param {'launch' | 'setup'} from - where the user arrived from
 */
export function showWorkspace(backRank, from) {
  startRank = backRank;
  cameFrom = from;
  render();
  showScreen('workspace');
}

function render() {
  const root = $('#workspace');
  const squares = [...startRank];
  board.render(buildPosition(squares));

  const valid = validateBackRank(startRank).valid;
  const fen = valid ? backRankToFEN(startRank) : '';
  $('[data-role="ws-rank"]', root).textContent = startRank;
  $('[data-role="ws-id"]', root).textContent = valid ? String(backRankToId(startRank)) : '—';
  $('[data-role="ws-fen"]', root).textContent = fen || '—';
  // Standard KQkq form for the display boundary (§4).
  $('[data-role="ws-fen-std"]', root).textContent = fen ? toStandardCastling(fen) : '—';
}
