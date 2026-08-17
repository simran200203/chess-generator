// @ts-check
/**
 * FEN generation for a starting position.
 *
 * Canonical internal representation for castling is X-FEN / Shredder-FEN: the
 * castling field encodes each rook's file letter (uppercase = white, lowercase
 * = black), ascending file order, e.g. rooks on c and h → "CHch". This is
 * emitted unconditionally, independent of standard vs Chess960 mode — the mode
 * flag governs the back-rank lock and UCI_Chess960 elsewhere, not the data
 * format. {@link toStandardCastling} down-converts to KQkq at display/export
 * boundaries only.
 */

import { validateBackRank } from './backrank.js';

const FILE_LETTERS = 'abcdefgh';

/**
 * Build the X-FEN castling field for a back rank (assumes a valid rank).
 * @param {string} backRank
 * @returns {string} e.g. "AHah" for rooks on a and h, "CHch" for c and h
 */
export function castlingField(backRank) {
  const rookFiles = [];
  for (let i = 0; i < 8; i++) if (backRank[i] === 'R') rookFiles.push(i);
  const white = rookFiles.map((i) => FILE_LETTERS[i].toUpperCase()).join('');
  const black = rookFiles.map((i) => FILE_LETTERS[i]).join('');
  return white + black;
}

/**
 * Build the full starting FEN for a back rank. Black's rank 8 uses the same
 * arrangement on the same files, lowercased (not mirrored). Side to move white,
 * no en passant, clocks reset. Castling is X-FEN (see module note).
 *
 * @param {string} backRank
 * @returns {string} full FEN, e.g.
 *   "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w AHah - 0 1"
 */
export function backRankToFEN(backRank) {
  const { valid, errors } = validateBackRank(backRank);
  if (!valid) {
    throw new Error(`invalid back rank "${backRank}": ${errors.join('; ')}`);
  }
  const white = backRank.toUpperCase();
  const black = backRank.toLowerCase();
  const castling = castlingField(backRank);
  return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w ${castling} - 0 1`;
}

/**
 * Find a king's file index within a single FEN rank field (which may contain
 * digit run-lengths for empty squares).
 * @param {string} rankField
 * @param {string} kingChar - 'K' (white) or 'k' (black)
 * @returns {number} 0-based file, or -1 if absent
 */
function kingFileInRank(rankField, kingChar) {
  let file = 0;
  for (const ch of rankField) {
    if (ch >= '1' && ch <= '8') {
      file += Number(ch);
    } else {
      if (ch === kingChar) return file;
      file++;
    }
  }
  return -1;
}

/**
 * Down-convert a FEN's X-FEN castling field to classic KQkq, by classifying
 * each rook file as king-side (file greater than its king) or queen-side. Call
 * this only at display and export boundaries; the internal representation stays
 * X-FEN. Idempotent on FENs that already use KQkq. Returns the FEN unchanged if
 * castling is "-".
 *
 * @param {string} fen
 * @returns {string} the FEN with a KQkq-style castling field
 */
export function toStandardCastling(fen) {
  const parts = fen.split(' ');
  const castling = parts[2];
  if (castling === '-') return fen;

  const ranks = parts[0].split('/');
  const whiteKingFile = kingFileInRank(ranks[7], 'K'); // rank 1 is last
  const blackKingFile = kingFileInRank(ranks[0], 'k'); // rank 8 is first

  let K = false, Q = false, k = false, q = false;
  for (const ch of castling) {
    if (ch >= 'A' && ch <= 'H') {
      // White rook by file letter.
      if (FILE_LETTERS.indexOf(ch.toLowerCase()) > whiteKingFile) K = true;
      else Q = true;
    } else if (ch >= 'a' && ch <= 'h') {
      // Black rook by file letter.
      if (FILE_LETTERS.indexOf(ch) > blackKingFile) k = true;
      else q = true;
    } else if (ch === 'K') K = true;
    else if (ch === 'Q') Q = true;
    else if (ch === 'k') k = true;
    else if (ch === 'q') q = true;
  }

  parts[2] = (K ? 'K' : '') + (Q ? 'Q' : '') + (k ? 'k' : '') + (q ? 'q' : '') || '-';
  return parts.join(' ');
}
