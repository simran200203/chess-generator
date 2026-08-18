// @ts-check
/**
 * App entry — screen routing, mode select, and the Board Ready transition.
 * Standard chess skips setup (rank locked to RNBQKBNR); Chess960 goes through
 * the setup screen (§9).
 */

import { showScreen } from './router.js';
import * as state from './state.js';
import { initSetup } from './setup.js';
import { initWorkspace, showWorkspace } from './workspace.js';

/** @param {string} sel */
const $ = (sel) => document.querySelector(sel);

function main() {
  initSetup();
  initWorkspace();

  // Launch: mode select.
  $('[data-role="mode-chess"]').addEventListener('click', () => {
    state.setMode('chess');
    state.setSquares('RNBQKBNR');
    showWorkspace('RNBQKBNR', 'launch');
  });
  $('[data-role="mode-chess960"]').addEventListener('click', () => {
    state.setMode('chess960');
    state.clear();
    showScreen('setup');
  });

  // Setup → workspace.
  $('[data-role="board-ready"]').addEventListener('click', () => {
    const rank = state.getSquares().join('');
    showWorkspace(rank, 'setup');
  });
  // Setup → back to launch.
  $('[data-role="back-launch"]').addEventListener('click', () => {
    showScreen('launch');
  });

  showScreen('launch');
}

main();
