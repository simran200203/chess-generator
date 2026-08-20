// @ts-check
/**
 * Chess960 setup screen. Wires three input methods to one shared state (§9):
 * drag from tray / between files (Pointer Events), typing a back-rank string,
 * and seeded Randomise. Renders the board, the position dial, live validation,
 * autocomplete, the mirrored black rank, and the tri-representation readout.
 */

import * as state from './state.js';
import { createBoard, buildPosition, rank1Index, pieceSrc } from './board.js';
import { createDial } from './dial.js';
import {
  validateBackRank, backRankToId, backRankToFEN,
  legalCompletions, idToBackRank, mulberry32, coerceSeed,
} from '../core/index.js';

/** @param {string} sel */
const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Initialise the setup screen. Idempotent-safe to call once at startup.
 */
export function initSetup() {
  const root = $('#setup');
  const board = createBoard($('[data-role="board"]', root));
  const updateDial = createDial($('[data-role="dial"]', root));

  const trayEl = $('[data-role="tray"]', root);
  const statusEl = $('[data-role="status"]', root);
  const completeEl = $('[data-role="complete"]', root);
  const rankInput = /** @type {HTMLInputElement} */ ($('[data-role="rank-input"]', root));
  const seedInput = /** @type {HTMLInputElement} */ ($('[data-role="seed-input"]', root));
  const randomiseBtn = $('[data-role="randomise"]', root);
  const trRank = $('[data-role="tr-rank"]', root);
  const trId = $('[data-role="tr-id"]', root);
  const trFen = $('[data-role="tr-fen"]', root);

  // Rank-1 squares (files a1..h1) are the interactive row.
  const rankSquares = [];
  for (let f = 0; f < 8; f++) {
    const sq = board.squares[rank1Index(f)];
    sq.dataset.file = String(f);
    sq.classList.add('sq--rank1');
    sq.tabIndex = 0;
    rankSquares.push(sq);
  }

  // --- Tray ---------------------------------------------------------------
  buildTray(trayEl);

  // --- Keyboard placement -------------------------------------------------
  /** @type {{ kind: 'tray'|'board', piece: string, file?: number } | null} */
  let held = null;

  function setHeld(next) {
    held = next;
    for (const chip of trayEl.querySelectorAll('.chip')) {
      chip.classList.toggle('chip--held', !!next && next.kind === 'tray' && next.piece === chip.dataset.piece);
    }
    for (const sq of rankSquares) {
      sq.classList.toggle('sq--held', !!next && next.kind === 'board' && next.file === Number(sq.dataset.file));
    }
  }

  // --- Placement semantics ------------------------------------------------
  /** @param {{kind:'tray'|'board', piece:string, file?:number}} origin @param {number} toFile */
  function place(origin, toFile) {
    const sq = state.getSquares();
    if (origin.kind === 'tray') {
      sq[toFile] = origin.piece; // replaces any occupant (which returns to tray)
    } else {
      const from = origin.file;
      if (from === toFile) return;
      [sq[from], sq[toFile]] = [sq[toFile], sq[from]]; // swap / move
    }
    state.setSquares(sq);
  }

  /** @param {number} file - return the file's piece to the tray */
  function returnToTray(file) {
    state.setSquare(file, null);
  }

  // --- Pointer: click-to-place and drag share one path -------------------
  // A press becomes a drag once it moves past the threshold; otherwise the
  // pointer-up is a click (select tray piece / place / pick up).
  const DRAG_THRESHOLD = 5;
  /** @type {HTMLElement|null} */
  let ghost = null;
  /** @type {{kind:'tray'|'board', piece:string, file?:number}|null} */
  let dragOrigin = null;
  let hoverFile = -1;
  /** @type {{kind:'tray'|'board', piece:string, file?:number, x:number, y:number}|null} */
  let press = null;

  function beginDrag(ev) {
    setHeld(null); // starting a drag cancels any click-selection cleanly
    dragOrigin = { kind: press.kind, piece: press.piece, file: press.file };
    ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML =
      `<img class="pc pc--w" src="${pieceSrc('w', press.piece)}" alt="" draggable="false" />`;
    document.body.appendChild(ghost);
    moveGhost(ev);
  }

  function moveGhost(ev) {
    if (ghost) ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
  }

  function onPointerMove(ev) {
    if (!press) return;
    if (!dragOrigin) {
      if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < DRAG_THRESHOLD) return;
      if (press.kind === 'board' && !press.piece) return; // empty square: click only
      beginDrag(ev);
    }
    ev.preventDefault();
    moveGhost(ev);
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const sq = el && el.closest('.sq--rank1');
    const overTray = !!(el && el.closest('[data-role="tray"]'));
    const file = sq ? Number(sq.dataset.file) : -1;
    if (file !== hoverFile) {
      if (hoverFile >= 0) rankSquares[hoverFile].classList.remove('sq--over');
      hoverFile = file;
      if (file >= 0) rankSquares[file].classList.add('sq--over');
    }
    trayEl.classList.toggle('tray--over', overTray && dragOrigin?.kind === 'board');
  }

  function onPointerUp(ev) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    const p = press;
    press = null;
    if (dragOrigin) { finishDrag(ev); return; }
    if (p) handleClick(p);
  }

  function finishDrag(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const sq = el && el.closest('.sq--rank1');
    const overTray = !!(el && el.closest('[data-role="tray"]'));
    if (sq && dragOrigin) place(dragOrigin, Number(sq.dataset.file));
    else if (overTray && dragOrigin?.kind === 'board') returnToTray(dragOrigin.file);
    if (hoverFile >= 0) rankSquares[hoverFile].classList.remove('sq--over');
    trayEl.classList.remove('tray--over');
    hoverFile = -1;
    ghost?.remove();
    ghost = null;
    dragOrigin = null;
  }

  /** Click (no drag): mirrors the keyboard select / place / pick-up flow. */
  function handleClick(p) {
    if (p.kind === 'tray') {
      setHeld(held?.kind === 'tray' && held.piece === p.piece
        ? null : { kind: 'tray', piece: p.piece });
      return;
    }
    const piece = state.getSquares()[p.file];
    if (held) {
      place(held, p.file); // place tray piece, or move/swap a board piece
      setHeld(null);
    } else if (piece) {
      setHeld({ kind: 'board', piece, file: p.file });
    } else {
      setHeld(null);
    }
  }

  /** @param {{kind:'tray'|'board', piece:string, file?:number}} info */
  function armPress(info, ev) {
    press = { ...info, x: ev.clientX, y: ev.clientY };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  // Board rank-1: a press over any rank-1 square (drag a piece, or click to place).
  board.el.addEventListener('pointerdown', (ev) => {
    const sq = ev.target.closest?.('.sq--rank1');
    if (!sq) return;
    const file = Number(sq.dataset.file);
    armPress({ kind: 'board', piece: state.getSquares()[file], file }, ev);
  });

  // Tray: a press on an available chip (drag out, or click to select).
  trayEl.addEventListener('pointerdown', (ev) => {
    const chip = ev.target.closest?.('.chip');
    if (!chip || chip.classList.contains('chip--empty')) return;
    armPress({ kind: 'tray', piece: chip.dataset.piece }, ev);
  });

  // --- Keyboard: tray select, rank-1 place/pick-up ------------------------
  trayEl.addEventListener('keydown', (ev) => {
    const chip = ev.target.closest?.('.chip');
    if (!chip || chip.classList.contains('chip--empty')) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setHeld(held?.kind === 'tray' && held.piece === chip.dataset.piece
        ? null : { kind: 'tray', piece: chip.dataset.piece });
    }
  });

  board.el.addEventListener('keydown', (ev) => {
    const sq = ev.target.closest?.('.sq--rank1');
    if (!sq) return;
    const file = Number(sq.dataset.file);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      const next = file + (ev.key === 'ArrowRight' ? 1 : -1);
      if (next >= 0 && next < 8) rankSquares[next].focus();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const piece = state.getSquares()[file];
      if (held) {
        place(held, file);
        setHeld(null);
      } else if (piece) {
        setHeld({ kind: 'board', piece, file });
      }
    } else if (ev.key === 'Escape') {
      setHeld(null);
    } else if (ev.key === 'Backspace' || ev.key === 'Delete') {
      ev.preventDefault();
      returnToTray(file);
    }
  });

  // --- Typed input --------------------------------------------------------
  rankInput.addEventListener('input', () => {
    const cleaned = rankInput.value.toUpperCase().replace(/[^RNBQK]/g, '').slice(0, 8);
    if (cleaned !== rankInput.value) rankInput.value = cleaned;
    /** @type {(string|null)[]} */
    const arr = new Array(8).fill(null);
    for (let i = 0; i < cleaned.length; i++) arr[i] = cleaned[i];
    state.setSquares(arr);
  });

  // --- Randomise (seeded, reproducible §6) --------------------------------
  randomiseBtn.addEventListener('click', () => {
    const seed = coerceSeed(seedInput.value);
    const id = Math.floor(mulberry32(seed)() * 960);
    state.setSeed(seed);
    seedInput.value = String(seed);
    state.setSquares([...idToBackRank(id)]);
  });

  // --- Autocomplete completion --------------------------------------------
  function renderComplete(squares, completions) {
    completeEl.replaceChildren();
    if (state.placedCount() < 8 && completions.length === 1) {
      const btn = document.createElement('button');
      btn.className = 'btn btn--complete';
      btn.textContent = `Complete → ${completions[0]}`;
      btn.addEventListener('click', () => state.setSquares([...completions[0]]));
      completeEl.appendChild(btn);
    }
  }

  // --- Master render (subscribed to state) --------------------------------
  function render() {
    const squares = state.getSquares();
    board.render(buildPosition(squares));
    updateDial();

    // Tray counts.
    const rem = state.remaining();
    for (const chip of trayEl.querySelectorAll('.chip')) {
      const n = Math.max(0, rem[chip.dataset.piece] ?? 0);
      chip.querySelector('.chip__count').textContent = String(n);
      chip.classList.toggle('chip--empty', n === 0);
    }

    // Validation status + Board Ready + autocomplete.
    const placed = state.placedCount();
    const full = squares.join('');
    const completions = legalCompletions(squares);
    let ready = false, text = '', tone = 'neutral';
    if (placed === 8) {
      const v = validateBackRank(full);
      if (v.valid) {
        ready = true;
        tone = 'ok';
        text = `${backRankToId(full) === 518 ? 'standard position' : 'legal position'} · ready`;
      } else {
        tone = 'error';
        text = v.errors[0];
      }
    } else if (completions.length === 0) {
      tone = 'error';
      text = "these pieces can't complete a legal position";
    } else {
      text = `${placed} of 8 placed · ${completions.length} position${completions.length === 1 ? '' : 's'} fit`;
    }
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
    $('[data-role="board-ready"]', root).disabled = !ready;
    renderComplete(squares, completions);

    // Tri-representation readout (— is fine here; the dial carries the live one).
    const resolved = placed === 8 && validateBackRank(full).valid;
    trRank.textContent = state.rankString('·');
    trId.textContent = resolved ? String(backRankToId(full)) : '—';
    trFen.textContent = resolved ? backRankToFEN(full) : '—';

    // Keep the typed field mirrored to state unless the user is editing it.
    if (document.activeElement !== rankInput) {
      rankInput.value = squares.filter(Boolean).join('');
    }
    if (state.getSeed() != null && document.activeElement !== seedInput) {
      seedInput.value = String(state.getSeed());
    }
  }

  state.subscribe(render);
  render();
}

/**
 * Build the piece tray. Chips are drag sources and keyboard-selectable.
 * @param {HTMLElement} trayEl
 */
function buildTray(trayEl) {
  trayEl.replaceChildren();
  const names = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  for (const piece of state.TRAY_ORDER) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.piece = piece;
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', `place a ${names[piece]}`);
    chip.innerHTML =
      `<img class="pc pc--w" src="${pieceSrc('w', piece)}" alt="" draggable="false" />` +
      `<span class="chip__count">${state.TARGET[piece]}</span>`;
    trayEl.appendChild(chip);
  }
}
