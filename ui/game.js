// @ts-check
/**
 * Game state — start FEN plus a move list, with the current FEN derived from
 * the engine and cached per ply (§3). Moves are stored in engine UCI
 * (king-takes-rook for castles), the canonical form that feeds straight back
 * into `position … moves`.
 *
 * All move application flows through {@link Game#playMove}, whose `source` is a
 * parameter — user input, an engine opponent, or a played-out suggestion all
 * use the same path, so adding a play-vs-engine mode later is a new caller, not
 * a refactor.
 */

/**
 * @typedef {object} Ply
 * @property {string|null} move - engine UCI that produced this position (null at ply 0)
 * @property {string} fen - position after the move
 * @property {string|null} source - who made the move ('user' | 'engine' | …)
 * @property {string[]} checkers - checking pieces in this position
 */

/**
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 */
export function createGame(engine) {
  /** @type {Ply[]} */
  let history = [];
  let cursor = 0;
  /** @type {string[] | null} */
  let legalCache = null;
  let legalCacheFen = '';
  /** @type {() => void} */
  let onChange = () => {};

  /** @param {() => void} fn */
  function subscribe(fn) { onChange = fn; }

  /**
   * Load a starting position, resetting the move list.
   * @param {string} startFen
   */
  async function load(startFen) {
    const { fen, checkers } = await engine.describe(startFen);
    history = [{ move: null, fen, source: null, checkers }];
    cursor = 0;
    legalCache = null;
    onChange();
  }

  /**
   * Load a complete game (start FEN + move list) into the history, e.g. a
   * generated game, so it can be stepped through. Derives each position from
   * the engine.
   * @param {string} startFen
   * @param {string[]} movesList - engine UCI
   */
  async function loadGame(startFen, movesList) {
    const first = await engine.describe(startFen);
    /** @type {Ply[]} */
    const built = [{ move: null, fen: first.fen, source: null, checkers: first.checkers }];
    let cur = first.fen;
    for (const mv of movesList) {
      const d = await engine.describe(cur, [mv]);
      built.push({ move: mv, fen: d.fen, source: 'generated', checkers: d.checkers });
      cur = d.fen;
    }
    history = built;
    cursor = 0;
    legalCache = null;
    onChange();
  }

  function current() {
    return history[cursor];
  }

  /** @returns {Promise<string[]>} legal moves (engine UCI) for the current position */
  async function legalMoves() {
    const fen = current().fen;
    if (legalCache && legalCacheFen === fen) return legalCache;
    legalCache = await engine.legalMoves(fen);
    legalCacheFen = fen;
    return legalCache;
  }

  /**
   * Apply a move from any source. Rejects moves that are not legal in the
   * current position. Making a move from a back position truncates the future.
   * @param {string} uci - engine UCI
   * @param {{ source: string }} opts
   * @returns {Promise<boolean>} whether the move was applied
   */
  async function playMove(uci, { source }) {
    const legal = await legalMoves();
    if (!legal.includes(uci)) return false;
    const { fen, checkers } = await engine.describe(current().fen, [uci]);
    history = history.slice(0, cursor + 1);
    history.push({ move: uci, fen, source, checkers });
    cursor = history.length - 1;
    legalCache = null;
    onChange();
    return true;
  }

  /** @param {number} ply */
  function goto(ply) {
    const next = Math.max(0, Math.min(history.length - 1, ply));
    if (next === cursor) return;
    cursor = next;
    legalCache = null;
    onChange();
  }

  function back() { goto(cursor - 1); }
  function forward() { goto(cursor + 1); }

  return {
    load, loadGame, playMove, goto, back, forward, legalMoves, current, subscribe,
    get cursor() { return cursor; },
    get history() { return history; },
    get atStart() { return cursor === 0; },
    get atEnd() { return cursor === history.length - 1; },
  };
}
