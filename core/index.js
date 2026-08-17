// @ts-check
/**
 * Chess960 core — barrel re-export of the pure representation modules.
 * Three interconvertible representations: back-rank string, position ID, FEN.
 */

export { ERRORS, squareColor, validateBackRank } from './backrank.js';
export { idToBackRank, backRankToId } from './scharnagl.js';
export { backRankToFEN, castlingField, toStandardCastling } from './fen.js';
