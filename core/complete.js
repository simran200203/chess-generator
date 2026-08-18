// @ts-check
/**
 * Legal completions of a partially-placed back rank. Pure, so it lives in core
 * and is tested: the setup screen's autocomplete offers a completion only when
 * exactly one legal position is consistent with the pieces placed so far.
 *
 * Enumeration over all 960 IDs is O(960) — negligible, and correct by
 * construction since every generated rank is legal.
 */

import { idToBackRank } from './scharnagl.js';

/**
 * All legal back ranks consistent with a partial placement.
 * @param {(string|null)[]} squares - length-8 array, null = empty file
 * @returns {string[]} legal full back ranks matching every placed file
 */
export function legalCompletions(squares) {
  const out = [];
  for (let id = 0; id < 960; id++) {
    const rank = idToBackRank(id);
    let match = true;
    for (let i = 0; i < 8; i++) {
      if (squares[i] != null && squares[i] !== rank[i]) {
        match = false;
        break;
      }
    }
    if (match) out.push(rank);
  }
  return out;
}
