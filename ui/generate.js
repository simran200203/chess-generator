// @ts-check
/**
 * Generate panel (§7, §9). Exposes the constraint controls, runs the
 * convergence loop with a live progress panel and responsive cancel, replays
 * the best-so-far game on the board while candidates play out, and presents the
 * winner — with the hopeless ply surfaced prominently — loaded as a steppable
 * game.
 */

import { converge } from '../generate/converge.js';
import { CRITERIA, hopelessLabel } from '../generate/score.js';
import { coerceSeed } from '../core/index.js';

const $ = (sel, root) => root.querySelector(sel);

/** Strength defaults per target — the intended loser starts weaker (§7). */
const STRENGTH_DEFAULTS = {
  white: { w: 0.9, b: 0.6 },
  black: { w: 0.6, b: 0.9 },
  either: { w: 0.8, b: 0.8 },
  draw: { w: 0.9, b: 0.9 },
};

/**
 * @param {HTMLElement} root - the workspace screen element
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {{ previewPosition:(fen:string)=>void, loadGame:(f:string,m:string[],meta?:object)=>Promise<void>, game:any }} analyse
 */
export function createGenerate(root, engine, analyse) {
  const targetGroup = $('[data-role="gen-target"]', root);
  const whiteSlider = $('[data-role="gen-white"]', root);
  const blackSlider = $('[data-role="gen-black"]', root);
  const whiteVal = $('[data-role="gen-white-val"]', root);
  const blackVal = $('[data-role="gen-black-val"]', root);
  const criterionSel = $('[data-role="gen-criterion"]', root);
  const countInput = $('[data-role="gen-count"]', root);
  const seedInput = $('[data-role="gen-seed"]', root);
  const runBtn = $('[data-role="gen-run"]', root);
  const progressEl = $('[data-role="gen-progress"]', root);
  const progressText = $('[data-role="gen-progress-text"]', root);
  const cancelBtn = $('[data-role="gen-cancel"]', root);
  const resultEl = $('[data-role="gen-result"]', root);

  let target = 'white';
  let running = false;
  let cancelFlag = false;

  // Populate the criterion dropdown from the registry (§7: one entry each).
  for (const [key, c] of Object.entries(CRITERIA)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = c.label;
    criterionSel.appendChild(opt);
  }

  function syncSlider(slider, valEl) { valEl.textContent = (Number(slider.value) / 100).toFixed(2); }
  function applyStrengthDefaults() {
    const d = STRENGTH_DEFAULTS[target];
    whiteSlider.value = String(Math.round(d.w * 100));
    blackSlider.value = String(Math.round(d.b * 100));
    syncSlider(whiteSlider, whiteVal);
    syncSlider(blackSlider, blackVal);
  }

  // Target segmented control.
  for (const btn of targetGroup.querySelectorAll('[data-target]')) {
    btn.addEventListener('click', () => {
      target = btn.dataset.target;
      for (const b of targetGroup.querySelectorAll('[data-target]')) {
        b.classList.toggle('seg--active', b === btn);
      }
      applyStrengthDefaults();
    });
  }
  whiteSlider.addEventListener('input', () => syncSlider(whiteSlider, whiteVal));
  blackSlider.addEventListener('input', () => syncSlider(blackSlider, blackVal));
  applyStrengthDefaults();

  cancelBtn.addEventListener('click', () => { cancelFlag = true; cancelBtn.disabled = true; });
  runBtn.addEventListener('click', run);

  async function run() {
    if (running) return;
    running = true;
    cancelFlag = false;
    const startFen = analyse.game.current().fen;
    const seed = coerceSeed(seedInput.value);
    seedInput.value = String(seed); // surface the seed actually used
    const criterion = criterionSel.value;
    const opts = {
      startFen, target,
      whiteStrength: Number(whiteSlider.value) / 100,
      blackStrength: Number(blackSlider.value) / 100,
      criterion,
      candidateCount: Math.max(1, Math.min(500, Number(countInput.value) || 30)),
      seed,
    };

    runBtn.disabled = true;
    cancelBtn.disabled = false;
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    progressEl.hidden = false;
    progressText.textContent = 'starting…';

    engine.stop(); // cancel any in-flight analysis from the Analyse tab
    const replay = makeReplay(analyse);

    let res;
    try {
      res = await converge(engine, opts, {
        onProgress: (p) => { showProgress(p); replay.update(p.best); },
        shouldCancel: () => cancelFlag,
      });
    } finally {
      replay.stop();
      running = false;
      runBtn.disabled = false;
      cancelBtn.disabled = false;
      progressEl.hidden = true;
    }
    await showResult(res, startFen);
  }

  function showProgress(p) {
    if (p.phase === 'deep') {
      progressText.textContent = 'winner found — re-analysing deeply (tier 2)…';
      return;
    }
    const c = CRITERIA[p.criterion];
    const bestStr = p.best ? `${c.short} ${c.format(p.best.score)}` : '—';
    progressText.textContent =
      `game ${p.done} / ${p.total} · ${p.qualifying} qualifying · best so far: ${bestStr}`;
  }

  async function showResult(res, startFen) {
    resultEl.hidden = false;
    if (!res.ok) {
      resultEl.innerHTML = `<div class="gen-msg">${escapeHtml(res.reason)}</div>`;
      return;
    }
    const c = CRITERIA[res.criterion];
    const winnerName = res.winner === 'w' ? 'White' : res.winner === 'b' ? 'Black' : null;
    const rtype = res.game.result.type;
    const resultLine = winnerName
      ? `${cap(rtype)} — ${winnerName} wins`
      : `Draw (${rtype})`;
    const lost = winnerName ? hopelessLabel(res.hopelessPly) : '';

    resultEl.innerHTML = `
      ${lost ? `<div class="gen-hopeless">${escapeHtml(lost)}</div>` : ''}
      <div class="gen-result-row"><span>result</span><span>${escapeHtml(resultLine)}</span></div>
      <div class="gen-result-row"><span>${escapeHtml(c.label)}</span><span>${escapeHtml(c.format(res.score))}</span></div>
      <div class="gen-result-row"><span>length</span><span>${res.game.moves.length} plies</span></div>
      <div class="gen-result-row"><span>seed</span><span>${res.seed}</span></div>
      ${res.cancelled ? '<div class="gen-msg">cancelled — showing best of the games completed so far</div>' : ''}
    `;
    // Load the winner as a steppable game, marking the hopeless move.
    await analyse.loadGame(startFen, res.game.moves, { hopelessPly: res.hopelessPly });
  }
}

/** Replay the best-so-far game's last few plies on the board (no engine). */
function makeReplay(analyse) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  let curGame = null;
  let frames = [];
  let idx = 0;

  function update(best) {
    if (!best || best.game === curGame) return;
    curGame = best.game;
    const fens = best.game.fens;
    if (reduce || fens.length <= 1) { analyse.previewPosition(fens[fens.length - 1]); return; }
    frames = fens.slice(Math.max(0, fens.length - 8));
    idx = 0;
    if (!timer) timer = setInterval(tick, 650);
    tick();
  }
  function tick() {
    if (!frames.length) return;
    analyse.previewPosition(frames[idx % frames.length]);
    idx += 1;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  return { update, stop };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
