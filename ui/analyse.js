// @ts-check
/**
 * Analyse mode (§9): an interactive board, stepping forward/back through the
 * move list, the top three engine moves with evaluations, and an evaluation bar
 * alongside the board. Legality and evaluation come from the phase-3 wrapper.
 *
 * Interim move labels are plain UCI coordinates (what the engine emits, which
 * keeps phase-7 debugging simple), with O-O / O-O-O for castles. Full SAN is
 * deferred to the PGN phase.
 */

import { createBoard, fenToCells, squareToIdx } from './board.js';
import { createEvalBar } from './evalbar.js';
import { createGame } from './game.js';
import { pieceSrc } from './board.js';
import { describeMove, toEngineUci, kingSquare } from '../engine/castling.js';

const ANALYSE_DEPTH = 14;
const fileChar = (i) => String.fromCharCode(97 + i);
const squareStr = (sq) => fileChar(sq.file) + sq.rank;
const $ = (sel, root) => root.querySelector(sel);

/**
 * @param {HTMLElement} root - the workspace screen element
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 */
export function createAnalyse(root, engine) {
  const board = createBoard($('[data-role="board"]', root));
  const evalbar = createEvalBar($('[data-role="evalbar"]', root));
  const game = createGame(engine);

  const statusEl = $('[data-role="status"]', root);
  const movesEl = $('[data-role="top-moves"]', root);
  const listEl = $('[data-role="movelist"]', root);
  const fenEl = $('[data-role="cur-fen"]', root);

  let currentLegal = /** @type {string[]} */ ([]);
  let currentFen = '';
  let analysisToken = 0;
  /** @type {string|null} */ let selected = null;
  let baseMarks = /** @type {{lastMove:string[], check:string|null}} */ ({ lastMove: [], check: null });
  /** @type {number|null} */ let markedPly = null; // ply the position became lost (generated games)

  // --- Rendering ----------------------------------------------------------
  game.subscribe(() => { render().catch((e) => console.error(e)); });

  async function render() {
    const { fen, move, checkers } = game.current();
    currentFen = fen;
    board.render(fenToCells(fen));

    const active = fen.split(/\s+/)[1];
    const king = kingSquare(fen);
    selected = null;
    baseMarks = {
      lastMove: move ? [move.slice(0, 2), move.slice(2, 4)] : [],
      check: checkers.length && king ? squareStr(king) : null,
    };
    board.highlight(baseMarks);

    renderMoveList();
    fenEl.textContent = fen;

    currentLegal = await game.legalMoves();
    if (currentLegal.length === 0) {
      const mated = checkers.length > 0;
      const winner = active === 'w' ? 'Black' : 'White';
      statusEl.textContent = mated ? `Checkmate — ${winner} wins` : 'Stalemate — draw';
      statusEl.dataset.tone = 'terminal';
      // Saturate the bar toward the winner for mate; centre it for stalemate.
      evalbar.set(mated ? { scoreType: 'mate', score: active === 'w' ? -1 : 1 } : { scoreType: 'cp', score: 0 });
      movesEl.replaceChildren(row('—', 'no legal moves', ''));
      return;
    }

    const toMove = active === 'w' ? 'White' : 'Black';
    statusEl.textContent = checkers.length ? `${toMove} to move — check` : `${toMove} to move`;
    statusEl.dataset.tone = 'live';
    analysePosition(fen, active);
  }

  /** Run MultiPV analysis for a position, dropping stale results. */
  async function analysePosition(fen, active) {
    const token = ++analysisToken;
    engine.stop();
    movesEl.dataset.loading = 'true';
    let lines;
    try {
      lines = await engine.analyse(fen, { depth: ANALYSE_DEPTH, multipv: 3 });
    } catch {
      return;
    }
    if (token !== analysisToken || fen !== currentFen) return; // stale
    movesEl.dataset.loading = 'false';

    const sign = active === 'w' ? 1 : -1;
    const best = lines[0];
    if (best) evalbar.set({ scoreType: best.scoreType, score: best.score * sign });

    movesEl.replaceChildren(...lines.map((line) => {
      const uci = line.pv[0];
      const label = moveLabel(fen, uci);
      const ev = fmtEval(line.scoreType, line.score * sign);
      const el = row(String(line.multipv), label, ev);
      el.classList.add('suggestion');
      el.tabIndex = 0;
      el.addEventListener('click', () => game.playMove(uci, { source: 'user' }));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); game.playMove(uci, { source: 'user' }); }
      });
      return el;
    }));
  }

  function renderMoveList() {
    const h = game.history;
    listEl.replaceChildren();
    for (let i = 1; i < h.length; i++) {
      if (i % 2 === 1) {
        const num = document.createElement('span');
        num.className = 'movelist__num';
        num.textContent = `${Math.ceil(i / 2)}.`;
        listEl.appendChild(num);
      }
      const s = document.createElement('button');
      s.className = 'movelist__move';
      s.textContent = moveLabel(h[i - 1].fen, /** @type {string} */ (h[i].move));
      s.classList.toggle('movelist__move--current', i === game.cursor);
      s.classList.toggle('movelist__move--lost', i === markedPly);
      if (i === markedPly) s.title = 'position becomes lost here';
      s.addEventListener('click', () => game.goto(i));
      listEl.appendChild(s);
    }
  }

  // --- Board interaction: click-to-move and drag share one path ----------
  // A press becomes a drag once it moves past the threshold; otherwise the
  // pointer-up is treated as a click. Both resolve through game.playMove.
  const DRAG_THRESHOLD = 5;
  /** @type {{square:string, x:number, y:number, ownPiece:boolean}|null} */
  let press = null;
  /** @type {string|null} */ let dragFrom = null;
  let ghost = null;

  const activeColor = () => currentFen.split(/\s+/)[1];

  /** Legal destination squares for a piece (rook square + g/c for castles). */
  function targetsFor(from) {
    const targets = new Set();
    for (const m of currentLegal) {
      if (m.slice(0, 2) === from) {
        targets.add(m.slice(2, 4));
        const d = describeMove(currentFen, m);
        if (d.isCastle) targets.add(d.kingTo);
      }
    }
    return [...targets];
  }

  function selectPiece(square) {
    selected = square;
    board.highlight({ ...baseMarks, selected: square, targets: targetsFor(square) });
  }
  function clearSelection() {
    selected = null;
    board.highlight(baseMarks);
  }

  function makeGhost(cell) {
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    g.innerHTML = `<img class="pc pc--${cell.color}" src="${pieceSrc(cell.color, cell.type)}" alt="" draggable="false" />`;
    document.body.appendChild(g);
    return g;
  }
  function moveGhost(ev) {
    if (ghost) ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
  }

  function beginDrag(ev, from) {
    clearSelection(); // starting a drag cancels any click-selection cleanly
    dragFrom = from;
    const cell = fenToCells(currentFen)[squareToIdx(from)];
    board.highlight({ ...baseMarks, targets: targetsFor(from) });
    ghost = makeGhost(cell);
    moveGhost(ev);
  }

  board.el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const sq = ev.target.closest?.('.sq');
    if (!sq) return;
    const idx = Number(sq.dataset.idx);
    const cell = fenToCells(currentFen)[idx];
    press = {
      square: coordOf(idx),
      x: ev.clientX, y: ev.clientY,
      ownPiece: !!(cell && cell.color === activeColor()),
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });

  function onPointerMove(ev) {
    if (!press) return;
    if (!dragFrom) {
      if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < DRAG_THRESHOLD) return;
      if (!press.ownPiece || currentLegal.length === 0) return; // only own pieces drag
      ev.preventDefault();
      beginDrag(ev, press.square);
    }
    moveGhost(ev);
  }

  async function onPointerUp(ev) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    const p = press;
    press = null;
    if (dragFrom) { await finishDrag(ev); return; }
    if (p) await handleClick(p.square);
  }

  async function finishDrag(ev) {
    ghost?.remove();
    ghost = null;
    const from = dragFrom;
    dragFrom = null;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const sq = el && el.closest?.('.sq');
    if (!sq) { board.highlight(baseMarks); return; }
    const to = coordOf(Number(sq.dataset.idx));
    const uci = resolveUserMove(from, to, currentFen, currentLegal);
    if (uci) await game.playMove(uci, { source: 'user' });
    else board.highlight(baseMarks); // illegal drop → snap back, keep base marks
  }

  async function handleClick(square) {
    if (currentLegal.length === 0) { clearSelection(); return; }
    const cell = fenToCells(currentFen)[squareToIdx(square)];
    const own = !!(cell && cell.color === activeColor());
    if (selected) {
      if (square === selected) { clearSelection(); return; } // click again → deselect
      const uci = resolveUserMove(selected, square, currentFen, currentLegal);
      if (uci) { selected = null; await game.playMove(uci, { source: 'user' }); return; }
      if (own) { selectPiece(square); return; } // switch to another own piece
      clearSelection(); // empty / illegal → deselect
    } else if (own) {
      selectPiece(square);
    }
  }

  // --- Navigation ---------------------------------------------------------
  $('[data-role="nav-start"]', root).addEventListener('click', () => game.goto(0));
  $('[data-role="nav-back"]', root).addEventListener('click', () => game.back());
  $('[data-role="nav-forward"]', root).addEventListener('click', () => game.forward());
  $('[data-role="nav-end"]', root).addEventListener('click', () => game.goto(game.history.length - 1));
  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('screen--active')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); game.back(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); game.forward(); }
  });

  /**
   * Load a starting position into the analyser (fresh, no marked ply).
   * @param {string} startFen
   */
  async function load(startFen) {
    markedPly = null;
    await game.load(startFen);
  }

  /**
   * Render a position on the board without touching game state — used for the
   * best-so-far preview during generation (no engine calls).
   * @param {string} fen
   */
  function previewPosition(fen) {
    board.render(fenToCells(fen));
    board.highlight({});
  }

  /**
   * Load a generated game so it can be stepped through, marking the hopeless
   * move and jumping the board to that moment.
   * @param {string} startFen
   * @param {string[]} moves
   * @param {{ hopelessPly?: number|null }} [meta]
   */
  async function loadGame(startFen, moves, meta = {}) {
    markedPly = meta.hopelessPly ?? null;
    await game.loadGame(startFen, moves);
    if (markedPly) game.goto(markedPly);
  }

  return { load, previewPosition, loadGame, game };
}

// --- Helpers --------------------------------------------------------------

function coordOf(idx) {
  return fileChar(idx % 8) + (8 - Math.floor(idx / 8));
}

/**
 * Resolve a user drag (display move) to an engine UCI, or null if illegal.
 * Order: raw from+to (covers normal moves and the king-onto-rook castle
 * gesture), then a g/c castle-target fallback via the phase-3 translation.
 * @param {string} from @param {string} to @param {string} fen @param {string[]} legal
 * @returns {string|null}
 */
function resolveUserMove(from, to, fen, legal) {
  const promo = isPromotion(from, to, fen) ? 'q' : '';
  const raw = from + to + promo;
  if (legal.includes(raw)) return raw;
  const king = kingSquare(fen);
  if (king && from === squareStr(king)) {
    const toFile = to.charCodeAt(0) - 97;
    if (toFile === 6 || toFile === 2) {
      const side = toFile === 6 ? 'K' : 'Q';
      const eng = toEngineUci(fen, from, to, { castle: side });
      if (legal.includes(eng)) return eng;
    }
  }
  return null;
}

/** True only when a pawn genuinely reaches the last rank. */
function isPromotion(from, to, fen) {
  const cell = fenToCells(fen)[squareToIdx(from)];
  if (!cell || cell.type !== 'P') return false;
  const toRank = Number(to[1]);
  return (cell.color === 'w' && toRank === 8) || (cell.color === 'b' && toRank === 1);
}

/** @returns {string} UCI, or O-O / O-O-O for castles. */
function moveLabel(fen, uci) {
  const d = describeMove(fen, uci);
  return d.isCastle ? (d.side === 'K' ? 'O-O' : 'O-O-O') : uci;
}

function fmtEval(scoreType, score) {
  if (scoreType === 'mate') return `${score > 0 ? '+' : '−'}M${Math.abs(score)}`;
  const pawns = score / 100;
  return `${pawns >= 0 ? '+' : '−'}${Math.abs(pawns).toFixed(2)}`;
}

/** Build a top-moves row element. */
function row(rank, label, ev) {
  const el = document.createElement('div');
  el.className = 'move-row';
  el.innerHTML = `<span class="move-row__rank">${rank}</span>`
    + `<span class="move-row__label">${label}</span>`
    + `<span class="move-row__eval">${ev}</span>`;
  return el;
}
