// @ts-check
/**
 * Draw-by-rule detection used during generation (§7 termination). Pure and
 * FEN-driven so it is cheap (we already track a FEN per ply) and testable.
 */

/**
 * Repetition key: the position identity for threefold detection — board,
 * side to move, castling rights, and en-passant square (FEN fields 0–3), i.e.
 * everything except the move clocks.
 * @param {string} fen
 * @returns {string}
 */
export function repetitionKey(fen) {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/**
 * Basic insufficient-material draw: K vs K, K+single minor vs K, and
 * K+bishop vs K+bishop with both bishops on the same colour. Anything with a
 * pawn, rook, or queen is sufficient. (KNN vs K etc. is left to fifty-move.)
 * @param {string} fen
 * @returns {boolean}
 */
export function insufficientMaterial(fen) {
  const board = fen.trim().split(/\s+/)[0];
  const minors = { w: [], b: [] };
  const bishopSquareColor = { w: [], b: [] };
  let row = 0;
  for (const rank of board.split('/')) {
    let file = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
      const type = ch.toUpperCase();
      const color = ch === type ? 'w' : 'b';
      if (type === 'P' || type === 'R' || type === 'Q') return false; // sufficient
      if (type !== 'K') minors[color].push(type);
      if (type === 'B') bishopSquareColor[color].push((file + row) % 2);
      file++;
    }
    row++;
  }
  const nw = minors.w.length;
  const nb = minors.b.length;
  if (nw === 0 && nb === 0) return true; // K v K
  if ((nw === 1 && nb === 0) || (nw === 0 && nb === 1)) return true; // K+minor v K
  if (nw === 1 && nb === 1 && minors.w[0] === 'B' && minors.b[0] === 'B') {
    return bishopSquareColor.w[0] === bishopSquareColor.b[0]; // KB v KB, same colour
  }
  return false;
}
