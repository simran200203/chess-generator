// @ts-check
/**
 * The position dial — the signature element (§10). The back-rank string is the
 * hero while the position is unresolved (placed files in amber, empty files as
 * muted dots); when the rank becomes legal the ID takes over as hero and the
 * string demotes to a subordinate line. A deliberate hand-off, never an
 * em-dash placeholder, so the dial stays alive throughout setup.
 */

import * as state from './state.js';
import { validateBackRank, backRankToId } from '../core/index.js';

/**
 * Build the dial DOM inside a mount and return an update function.
 * @param {HTMLElement} mount
 * @returns {() => void} call to re-render from current state
 */
export function createDial(mount) {
  mount.classList.add('dial');
  mount.innerHTML = `
    <div class="dial__caption" data-role="caption">back rank</div>
    <div class="dial__id" data-role="id"></div>
    <div class="dial__rank" data-role="rank" aria-live="polite"></div>
    <div class="dial__tag" data-role="tag"></div>
  `;
  const captionEl = mount.querySelector('[data-role="caption"]');
  const idEl = mount.querySelector('[data-role="id"]');
  const rankEl = mount.querySelector('[data-role="rank"]');
  const tagEl = mount.querySelector('[data-role="tag"]');

  function update() {
    const squares = state.getSquares();
    const filled = squares.every(Boolean);
    const full = squares.join('');
    const resolved = filled && validateBackRank(full).valid;

    // Rank string: one span per file so placed vs empty can be styled.
    rankEl.replaceChildren(
      ...squares.map((c) => {
        const span = document.createElement('span');
        span.className = c ? 'dial__file' : 'dial__file dial__file--empty';
        span.textContent = c || '·';
        return span;
      }),
    );

    mount.classList.toggle('dial--resolved', resolved);
    if (resolved) {
      const id = backRankToId(full);
      captionEl.textContent = 'position id';
      idEl.textContent = String(id);
      tagEl.textContent = id === 518 ? 'standard' : '';
    } else {
      captionEl.textContent = 'back rank';
      idEl.textContent = '';
      tagEl.textContent = '';
    }
  }

  update();
  return update;
}
