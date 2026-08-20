// @ts-check
/**
 * Evaluation bar shown alongside the board (§9). A vertical bar whose split
 * reflects the advantage, White filling from the bottom. The centipawn value is
 * squashed to a fill fraction with a logistic so the bar is responsive near
 * equality and saturates for large advantages; mate fills it fully. Transitions
 * are smooth (§10).
 *
 * Values are given from White's perspective (positive = White is better).
 */

/**
 * @param {HTMLElement} mount
 */
export function createEvalBar(mount) {
  mount.classList.add('evalbar');
  mount.innerHTML = `
    <div class="evalbar__fill" data-role="fill"></div>
    <div class="evalbar__label" data-role="label"></div>
  `;
  const fill = /** @type {HTMLElement} */ (mount.querySelector('[data-role="fill"]'));
  const label = /** @type {HTMLElement} */ (mount.querySelector('[data-role="label"]'));

  /**
   * @param {{ scoreType: 'cp'|'mate', score: number } | null} evalW - White-POV eval, or null
   */
  function set(evalW) {
    if (!evalW) {
      fill.style.height = '50%';
      label.textContent = '';
      return;
    }
    let fraction; // White's share of the bar, 0..1
    let text;
    if (evalW.scoreType === 'mate') {
      fraction = evalW.score >= 0 ? 1 : 0;
      text = `M${Math.abs(evalW.score)}`;
    } else {
      // Logistic squash; ~1 pawn ≈ noticeable, saturates by ~±8 pawns.
      fraction = 1 / (1 + Math.exp(-evalW.score / 300));
      const pawns = evalW.score / 100;
      text = `${pawns >= 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`;
    }
    fill.style.height = `${(fraction * 100).toFixed(1)}%`;
    label.textContent = text;
    label.classList.toggle('evalbar__label--black', evalW.score < 0);
  }

  set(null);
  return { set };
}
