// @ts-check
/**
 * Reusable 8×8 board. Renders squares and pieces only — it holds no chess
 * state and knows nothing about setup or the engine. Interaction (drag,
 * keyboard placement) is orchestrated by the screen that owns it, using the
 * square elements this exposes. Pieces are inline SVG <use> references to the
 * sprite in index.html (§2, §10).
 *
 * Square indexing: idx = rank * 8 + file, where rank 0 is rank 8 (top) and
 * file 0 is the a-file. So a8 = 0, h8 = 7, a1 = 56, h1 = 63.
 */

const FILES = 'abcdefgh';

/** @typedef {{ color: 'w' | 'b', type: string } | null} Cell */

const PIECE_NAMES = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn',
};

/**
 * Index of the a1 square + file offset. Rank 1 (white back rank) is the bottom
 * row: files a1..h1 map to indices 56..63.
 * @param {number} file 0..7
 * @returns {number}
 */
export function rank1Index(file) {
  return 56 + file;
}

/**
 * Build a 64-cell board model for the setup/starting position from a white back
 * rank. Black's rank 8 mirrors the same arrangement on the same files (§4);
 * pawns fill ranks 2 and 7 when requested.
 * @param {(string|null)[]} rank1 - white back rank, file a→h
 * @param {{ showPawns?: boolean }} [opts]
 * @returns {Cell[]}
 */
export function buildPosition(rank1, opts = {}) {
  const showPawns = opts.showPawns !== false;
  /** @type {Cell[]} */
  const cells = new Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    const p = rank1[f];
    if (p) {
      cells[56 + f] = { color: 'w', type: p }; // rank 1
      cells[f] = { color: 'b', type: p }; // rank 8, mirrored
    }
    if (showPawns) {
      cells[48 + f] = { color: 'w', type: 'P' }; // rank 2
      cells[8 + f] = { color: 'b', type: 'P' }; // rank 7
    }
  }
  return cells;
}

/**
 * Path to a vendored, recoloured Cburnett piece SVG.
 * @param {'w' | 'b'} color
 * @param {string} type - one of K Q R B N P
 * @returns {string}
 */
export function pieceSrc(color, type) {
  return `pieces/Chess_${type.toLowerCase()}${color === 'w' ? 'l' : 'd'}t45.svg`;
}

/**
 * Create a piece image element.
 * @param {'w' | 'b'} color
 * @param {string} type
 * @returns {HTMLImageElement}
 */
function pieceEl(color, type) {
  const img = document.createElement('img');
  img.className = `pc pc--${color}`;
  img.src = pieceSrc(color, type);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  return img;
}

/**
 * @param {number} idx
 * @returns {string} algebraic coordinate, e.g. "a1"
 */
export function coord(idx) {
  const file = idx % 8;
  const rank = 8 - Math.floor(idx / 8);
  return `${FILES[file]}${rank}`;
}

/**
 * @param {Cell} cell
 * @param {number} idx
 * @returns {string} an accessible label for a square
 */
function squareLabel(cell, idx) {
  const c = coord(idx);
  if (!cell) return `${c}, empty`;
  const side = cell.color === 'w' ? 'white' : 'black';
  return `${c}, ${side} ${PIECE_NAMES[cell.type] || cell.type}`;
}

/**
 * Create a board and mount it.
 * @param {HTMLElement} mount
 * @returns {{
 *   el: HTMLElement,
 *   squares: HTMLElement[],
 *   render: (cells: Cell[]) => void,
 * }}
 */
export function createBoard(mount) {
  const el = document.createElement('div');
  el.className = 'board';
  el.setAttribute('role', 'grid');
  el.setAttribute('aria-label', 'chess board');

  /** @type {HTMLElement[]} */
  const squares = [];
  for (let idx = 0; idx < 64; idx++) {
    const file = idx % 8;
    const rank = Math.floor(idx / 8);
    const sq = document.createElement('div');
    const dark = (file + rank) % 2 === 1;
    sq.className = `sq sq--${dark ? 'dark' : 'light'}`;
    sq.dataset.idx = String(idx);
    sq.setAttribute('role', 'gridcell');
    sq.setAttribute('aria-label', squareLabel(null, idx));

    // Rank + file coordinate labels along the board edges.
    if (file === 0) {
      const r = document.createElement('span');
      r.className = 'sq__rank';
      r.textContent = String(8 - rank);
      sq.appendChild(r);
    }
    if (rank === 7) {
      const f = document.createElement('span');
      f.className = 'sq__file';
      f.textContent = FILES[file];
      sq.appendChild(f);
    }

    squares.push(sq);
    el.appendChild(sq);
  }

  mount.appendChild(el);

  /** @param {Cell[]} cells */
  function render(cells) {
    for (let idx = 0; idx < 64; idx++) {
      const sq = squares[idx];
      const existing = sq.querySelector('.pc');
      if (existing) existing.remove();
      const cell = cells[idx];
      if (cell) sq.appendChild(pieceEl(cell.color, cell.type));
      sq.setAttribute('aria-label', squareLabel(cell, idx));
    }
  }

  return { el, squares, render };
}
