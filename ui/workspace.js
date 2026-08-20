// @ts-check
/**
 * Workspace — hosts Analyse mode (§9). Owns the single engine instance, boots
 * it lazily on first entry, and drives the analyser. The Generate panel arrives
 * in a later phase.
 */

import { showScreen } from './router.js';
import { createEngine } from '../engine/engine.js';
import { createAnalyse } from './analyse.js';
import { backRankToFEN } from '../core/index.js';

/** @param {string} sel */
const $ = (sel, root = document) => root.querySelector(sel);

let engine = null;
let analyse = null;
let engineReady = null; // a Promise, created on first use
/** @type {string} */
let startFen = '';
/** @type {'launch' | 'setup'} */
let cameFrom = 'launch';

export function initWorkspace() {
  const root = $('#workspace');
  engine = createEngine();
  analyse = createAnalyse(root, engine);

  $('[data-role="ws-back"]', root).addEventListener('click', () => {
    if (analyse.game.history.length > 1
      && !confirm('Leave analysis? Your moves in this position will be lost.')) return;
    showScreen(cameFrom);
  });
  $('[data-role="ws-reset"]', root).addEventListener('click', () => {
    if (startFen) analyse.load(startFen);
  });
}

/**
 * Enter the workspace for a starting back rank.
 * @param {string} backRank
 * @param {'launch' | 'setup'} from
 */
export async function showWorkspace(backRank, from) {
  cameFrom = from;
  startFen = backRankToFEN(backRank);
  showScreen('workspace');

  const status = $('[data-role="status"]', $('#workspace'));
  if (!engineReady) {
    status.textContent = 'loading engine…';
    engineReady = engine.init();
  }
  await engineReady;
  await analyse.load(startFen);
}
