// @ts-check
/**
 * Screen routing — the app is one page with three <section class="screen">s.
 * Exactly one carries .screen--active at a time.
 */

/**
 * Show one screen by id, hiding the others.
 * @param {'launch' | 'setup' | 'workspace'} name
 */
export function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.toggle('screen--active', el.id === name);
  }
}
