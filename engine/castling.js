// @ts-check
/**
 * Gotcha 2 — king-takes-rook castling translation.
 *
 * With `UCI_Chess960 true`, Stockfish encodes castling as the king moving onto
 * its OWN rook's square (e.g. a kingside castle with the rook on h1 is `f1h1`,
 * not `f1g1`). This module converts between that engine form and a display form
 * where the king lands on the g/c file and the rook on f/d — in both
 * directions. Pure and DOM-free, so it is verified against the engine across
 * all 960 positions in tests/engine.html.
 *
 * The internal move list stays in the engine's king-takes-rook form (it is
 * unambiguous and feeds straight back into `position … moves`); translate to
 * display/PGN only at the edges.
 */

/**
 * @param {string} fen
 * @returns {{ board: string, active: 'w'|'b', castling: string }}
 */
function parts(fen) {
  const f = fen.trim().split(/\s+/);
  return { board: f[0], active: /** @type {'w'|'b'} */ (f[1] || 'w'), castling: f[2] || '-' };
}

const fileIdx = (ch) => ch.charCodeAt(0) - 97; // 'a' -> 0
const fileChar = (i) => String.fromCharCode(97 + i); // 0 -> 'a'

/**
 * Expand one FEN rank field into a file→piece map.
 * @param {string} rankField
 * @returns {string[]} index by file 0..7; empty files are undefined
 */
function expandRank(rankField) {
  const out = [];
  let f = 0;
  for (const ch of rankField) {
    if (ch >= '1' && ch <= '8') f += Number(ch);
    else { out[f] = ch; f++; }
  }
  return out;
}

/**
 * Square of the side-to-move king.
 * @param {string} fen
 * @returns {{ file: number, rank: number } | null}
 */
export function kingSquare(fen) {
  const { board, active } = parts(fen);
  const target = active === 'w' ? 'K' : 'k';
  const ranks = board.split('/');
  for (let r = 0; r < 8; r++) {
    const row = expandRank(ranks[r]);
    for (let f = 0; f < 8; f++) if (row[f] === target) return { file: f, rank: 8 - r };
  }
  return null;
}

/**
 * Files of the back-rank rooks the side to move may castle with. Handles both
 * X-FEN (rook file letters, our canonical form) and classic KQkq (resolved to
 * the outermost rook on each side).
 * @param {string} fen
 * @returns {number[]}
 */
export function castlingRookFiles(fen) {
  const { board, active, castling } = parts(fen);
  if (castling === '-') return [];
  const isWhiteSide = active === 'w';
  const row = expandRank(board.split('/')[isWhiteSide ? 7 : 0]);
  const king = kingSquare(fen);
  /** @type {number[]} */
  const out = [];
  for (const ch of castling) {
    const upper = ch === ch.toUpperCase();
    if (upper !== isWhiteSide) continue; // castling right for the other colour
    const c = ch.toLowerCase();
    if (c >= 'a' && c <= 'h') {
      out.push(fileIdx(c)); // X-FEN: explicit rook file
    } else if (c === 'k' && king) {
      for (let f = 7; f > king.file; f--) if ((row[f] || '').toLowerCase() === 'r') { out.push(f); break; }
    } else if (c === 'q' && king) {
      for (let f = 0; f < king.file; f++) if ((row[f] || '').toLowerCase() === 'r') { out.push(f); break; }
    }
  }
  return out;
}

/**
 * Interpret an engine UCI move (king-takes-rook for castles) as a display move.
 * @param {string} fen - position the move is played from
 * @param {string} uci - e.g. "f1h1", "e2e4", "e7e8q"
 * @returns {{
 *   uci: string, from: string, to: string, promotion: string,
 *   isCastle: boolean, side: ('K'|'Q'|null),
 *   kingTo: (string|null), rookFrom: (string|null), rookTo: (string|null),
 * }}
 */
export function describeMove(fen, uci) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.slice(4);
  const king = kingSquare(fen);
  const fromFile = fileIdx(from[0]);
  const fromRank = Number(from[1]);
  const toFile = fileIdx(to[0]);
  const toRank = Number(to[1]);

  let isCastle = false;
  /** @type {'K'|'Q'|null} */ let side = null;
  let kingTo = null;
  let rookFrom = null;
  let rookTo = null;

  if (king && fromFile === king.file && fromRank === king.rank && toRank === king.rank
      && castlingRookFiles(fen).includes(toFile)) {
    isCastle = true;
    side = toFile > king.file ? 'K' : 'Q';
    const kingToFile = side === 'K' ? 6 : 2; // g / c
    const rookToFile = side === 'K' ? 5 : 3; // f / d
    kingTo = fileChar(kingToFile) + king.rank;
    rookFrom = fileChar(toFile) + king.rank;
    rookTo = fileChar(rookToFile) + king.rank;
  }

  return { uci, from, to, promotion, isCastle, side, kingTo, rookFrom, rookTo };
}

/**
 * Convert a display move to the engine's UCI. For castling pass `castle` and
 * the result is the unambiguous king-takes-rook form; `to` is ignored then.
 * Non-castling moves pass through (with an optional promotion suffix).
 * @param {string} fen
 * @param {string} from - king's start square when castling; origin otherwise
 * @param {string} to - king's g/c destination when castling; target otherwise
 * @param {{ castle?: 'K'|'Q', promotion?: string }} [opts]
 * @returns {string}
 */
export function toEngineUci(fen, from, to, opts = {}) {
  const { castle, promotion = '' } = opts;
  if (castle) {
    const king = kingSquare(fen);
    const rooks = castlingRookFiles(fen);
    const candidates = castle === 'K'
      ? rooks.filter((f) => f > king.file).sort((a, b) => b - a)
      : rooks.filter((f) => f < king.file).sort((a, b) => a - b);
    return from + fileChar(candidates[0]) + king.rank;
  }
  return from + to + promotion;
}
