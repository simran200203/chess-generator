// @ts-check
/**
 * Workspace — hosts Analyse and Generate (§9), toggled by tabs in the right
 * panel. Owns the single engine instance and boots it lazily on first entry.
 */

import { showScreen } from './router.js';
import { createEngine } from '../engine/engine.js';
import { createAnalyse } from './analyse.js';
import { createGenerate } from './generate.js';
import { backRankToFEN } from '../core/index.js';

/** @param {string} sel */
const $ = (sel, root = document) => root.querySelector(sel);

let engine = null;
let analyse = null;
let engineReady = null;
/** @type {string} */
let startFen = '';
/** @type {'launch' | 'setup'} */
let cameFrom = 'launch';

export function initWorkspace() {
  const root = $('#workspace');
  engine = createEngine();
  analyse = createAnalyse(root, engine);
  createGenerate(root, engine, analyse);

  // Panel tabs: Analyse ⇄ Generate.
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const bodies = [...root.querySelectorAll('[data-tab-body]')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const t of tabs) t.classList.toggle('tab--active', t === tab);
      for (const b of bodies) b.hidden = b.dataset.tabBody !== tab.dataset.tab;
    });
  }

  $('[data-role="ws-back"]', root).addEventListener('click', () => {
    if (analyse.game.history.length > 1
      && !confirm('Leave the workspace? The game on the board will be lost.')) return;
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

  // Default to the Analyse tab on entry.
  const root = $('#workspace');
  for (const t of root.querySelectorAll('[data-tab]')) t.classList.toggle('tab--active', t.dataset.tab === 'analyse');
  for (const b of root.querySelectorAll('[data-tab-body]')) b.hidden = b.dataset.tabBody !== 'analyse';

  const status = $('[data-role="status"]', root);
  if (!engineReady) {
    status.textContent = 'loading engine…';
    engineReady = engine.init();
  }
  await engineReady;
  await analyse.load(startFen);
}
