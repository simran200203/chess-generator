// @ts-check
/**
 * Hand-rolled SVG evaluation graph (§9) — no charting library. Plots White's
 * win probability across the game (bounded 0–100, so mate scores don't
 * balloon), fills the area beneath the curve like the eval bar extended over
 * time, marks the current ply, and draws a LABELLED hopeless marker
 * ("lost at move N") since that is the most important single fact the tool
 * reports. Click/hover the graph to seek.
 */

import { winPct } from '../generate/score.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 320, H = 120, PAD = 4;

/**
 * @param {HTMLElement} mount
 * @param {{ onSeek?: (ply: number) => void }} [opts]
 */
export function createEvalGraph(mount, opts = {}) {
  const onSeek = opts.onSeek || (() => {});
  mount.classList.add('evalgraph');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  mount.replaceChildren(svg);

  let n = 0; // number of positions

  const x = (i) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD));
  const y = (wp) => PAD + (1 - wp / 100) * (H - 2 * PAD);

  svg.addEventListener('click', (ev) => seek(ev));
  svg.addEventListener('pointermove', (ev) => { if (ev.buttons) seek(ev); });
  function seek(ev) {
    if (n <= 1) return;
    const rect = svg.getBoundingClientRect();
    const frac = (ev.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  }

  /**
   * @param {number[]} cpWhite - White-POV centipawns per position
   * @param {{ hopelessPly?: number|null, cursor?: number, lostLabel?: string }} [state]
   */
  function render(cpWhite, state = {}) {
    n = cpWhite.length;
    const wp = cpWhite.map((cp) => winPct(cp));
    const pts = wp.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`);

    const area = n > 1
      ? `M${x(0).toFixed(1)},${H - PAD} L${pts.join(' L')} L${x(n - 1).toFixed(1)},${H - PAD} Z`
      : '';

    const parts = [];
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" class="eg-bg"/>`);
    if (area) parts.push(`<path d="${area}" class="eg-area"/>`);
    parts.push(`<line x1="0" y1="${y(50).toFixed(1)}" x2="${W}" y2="${y(50).toFixed(1)}" class="eg-mid"/>`);
    if (n > 1) parts.push(`<polyline points="${pts.join(' ')}" class="eg-line"/>`);

    // Labelled hopeless marker.
    if (state.hopelessPly && state.hopelessPly < n) {
      const hx = x(state.hopelessPly);
      parts.push(`<line x1="${hx.toFixed(1)}" y1="0" x2="${hx.toFixed(1)}" y2="${H}" class="eg-lost"/>`);
      const label = state.lostLabel || `lost at move ${Math.ceil(state.hopelessPly / 2)}`;
      const anchor = hx > W * 0.6 ? 'end' : 'start';
      const lx = anchor === 'end' ? hx - 4 : hx + 4;
      parts.push(`<text x="${lx.toFixed(1)}" y="13" text-anchor="${anchor}" class="eg-lost-label">${escape(label)}</text>`);
    }

    // Current-ply cursor.
    if (state.cursor != null && n > 1) {
      const cx = x(state.cursor);
      parts.push(`<line x1="${cx.toFixed(1)}" y1="0" x2="${cx.toFixed(1)}" y2="${H}" class="eg-cursor"/>`);
    }

    svg.innerHTML = parts.join('');
  }

  return { render };
}

const escape = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
