// @ts-check
/**
 * SAN (Standard Algebraic Notation) generation, deferred to phase 8 (§4). The
 * pure `moveToSan` derives notation from the position, the legal-move list (for
 * disambiguation), and the resulting position's check state; `annotateSan`
 * gathers that per-position data from the engine for a whole game.
 */

import { fenToCells, squareToIdx } from '../ui/board.js';
import { describeMove } from '../engine/castling.js';

const FILES = 'abcdefgh';
const fileOf = (sq) => sq.charCodeAt(0) - 97;
const rankOf = (sq) => Number(sq[1]);

/**
 * Convert one engine-UCI move to SAN.
 * @param {string} fen - position the move is played from
 * @param {string} uci
 * @param {string[]} legalFromHere - engine UCI of all legal moves from `fen`
 * @param {{ checkers: string[], noLegal: boolean }} resultState - the position after the move
 * @returns {string}
 */
export function moveToSan(fen, uci, legalFromHere, resultState) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.slice(4);

  const castle = describeMove(fen, uci);
  let san;
  if (castle.isCastle) {
    san = castle.side === 'K' ? 'O-O' : 'O-O-O';
  } else {
    const cells = fenToCells(fen);
    const piece = cells[squareToIdx(from)];
    const type = piece ? piece.type : 'P';
    if (type === 'P') {
      const capture = fileOf(from) !== fileOf(to);
      san = capture ? `${FILES[fileOf(from)]}x${to}` : `${to}`;
      if (promo) san += `=${promo.toUpperCase()}`;
    } else {
      const capture = cells[squareToIdx(to)] !== null;
      san = type + disambiguator(fen, cells, type, from, to, legalFromHere) + (capture ? 'x' : '') + to;
    }
  }

  if (resultState.checkers.length) san += resultState.noLegal ? '#' : '+';
  return san;
}

/** Minimal disambiguation string (file, rank, or full square) or ''. */
function disambiguator(fen, cells, type, from, to, legalFromHere) {
  const rivals = [];
  for (const m of legalFromHere) {
    if (m === from + to || m.slice(2, 4) !== to) continue;
    const rf = m.slice(0, 2);
    const cell = cells[squareToIdx(rf)];
    if (cell && cell.type === type) rivals.push(rf);
  }
  if (rivals.length === 0) return '';
  const candidates = [from, ...rivals];
  const sameFile = candidates.filter((c) => fileOf(c) === fileOf(from)).length;
  const sameRank = candidates.filter((c) => rankOf(c) === rankOf(from)).length;
  if (sameFile === 1) return FILES[fileOf(from)];
  if (sameRank === 1) return String(rankOf(from));
  return from;
}

/**
 * Produce SAN for every move of a game, gathering the per-position legal moves
 * and check state from the engine (one-time, e.g. at export or annotation).
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {string[]} fens
 * @param {string[]} moves - engine UCI
 * @returns {Promise<string[]>}
 */
export async function annotateSan(engine, fens, moves) {
  // Gather legal moves + checkers for every position once.
  const legal = [];
  const checkers = [];
  for (let i = 0; i < fens.length; i++) {
    legal.push(await engine.legalMoves(fens[i]));
    checkers.push((await engine.describe(fens[i])).checkers);
  }
  const san = [];
  for (let k = 0; k < moves.length; k++) {
    san.push(moveToSan(fens[k], moves[k], legal[k], {
      checkers: checkers[k + 1],
      noLegal: legal[k + 1].length === 0,
    }));
  }
  return san;
}
