// @ts-check
/**
 * Promise-based UCI wrapper around the vendored single-threaded Stockfish WASM
 * worker. No other module writes raw UCI (§5). Exposed as a factory so callers
 * can run two independent instances with asymmetric settings (§5, phase 6).
 *
 * The engine runs in a Web Worker; commands are serialized so streaming UCI
 * output is matched to the right promise.
 */

/**
 * @param {string | URL} [url] - path to the worker script
 * @returns {{
 *   init: () => Promise<void>,
 *   analyse: (fen: string, opts?: {depth?: number, multipv?: number}) => Promise<AnalysisLine[]>,
 *   legalMoves: (fen: string) => Promise<string[]>,
 *   applyMoves: (fen: string, moves: string[]) => Promise<string>,
 *   quit: () => void,
 * }}
 */
export function createEngine(url = new URL('./stockfish.js', import.meta.url)) {
  const worker = new Worker(url);

  /** @type {((line: string) => void) | null} */
  let onLine = null;
  worker.onmessage = (e) => {
    const line = typeof e.data === 'string'
      ? e.data
      : (e.data && typeof e.data.data === 'string' ? e.data.data : '');
    if (onLine) onLine(line);
  };

  // Serialize commands: each exec waits for the previous to reach its terminal.
  let chain = Promise.resolve();

  /**
   * Send commands and collect output lines until `done(line)` is true.
   * @param {string[]} commands
   * @param {(line: string) => boolean} done
   * @returns {Promise<string[]>}
   */
  function exec(commands, done) {
    const run = () => new Promise((resolve) => {
      /** @type {string[]} */
      const lines = [];
      onLine = (line) => {
        lines.push(line);
        if (done(line)) { onLine = null; resolve(lines); }
      };
      for (const c of commands) worker.postMessage(c);
    });
    const p = chain.then(run);
    chain = p.catch(() => {});
    return /** @type {Promise<string[]>} */ (p);
  }

  async function init() {
    await exec(['uci'], (l) => l.trim() === 'uciok');
    await exec(
      ['setoption name UCI_Chess960 value true', 'isready'],
      (l) => l.trim() === 'readyok',
    );
  }

  /**
   * @param {string} fen
   * @param {{depth?: number, multipv?: number}} [opts]
   * @returns {Promise<AnalysisLine[]>}
   */
  async function analyse(fen, { depth = 12, multipv = 3 } = {}) {
    await exec(
      [`setoption name MultiPV value ${multipv}`, 'isready'],
      (l) => l.trim() === 'readyok',
    );
    const lines = await exec(
      [`position fen ${fen}`, `go depth ${depth}`],
      (l) => l.startsWith('bestmove'),
    );
    return parseAnalysis(lines);
  }

  /**
   * Legal moves via `go perft 1`, in engine UCI (king-takes-rook for castles).
   * @param {string} fen
   * @returns {Promise<string[]>}
   */
  async function legalMoves(fen) {
    const lines = await exec(
      [`position fen ${fen}`, 'go perft 1'],
      (l) => /^Nodes searched:/i.test(l.trim()),
    );
    /** @type {string[]} */
    const moves = [];
    for (const line of lines) {
      const m = /^([a-h][1-8][a-h][1-8][qrbn]?):\s*\d+/.exec(line.trim());
      if (m) moves.push(m[1].toLowerCase());
    }
    return moves;
  }

  /**
   * Apply moves to a position and return the resulting FEN (parsed from `d`).
   * @param {string} fen
   * @param {string[]} moves - engine UCI
   * @returns {Promise<string>}
   */
  async function applyMoves(fen, moves) {
    const pos = moves && moves.length
      ? `position fen ${fen} moves ${moves.join(' ')}`
      : `position fen ${fen}`;
    // Terminate on the last line of the `d` block so trailing lines don't leak.
    const lines = await exec([pos, 'd'], (l) => /^Checkers:/i.test(l.trim()));
    const fenLine = lines.find((l) => /^Fen:/i.test(l.trim()));
    if (!fenLine) throw new Error('applyMoves: engine did not report a Fen');
    return fenLine.replace(/^Fen:\s*/i, '').trim();
  }

  function quit() {
    try { worker.postMessage('quit'); } catch { /* ignore */ }
    worker.terminate();
  }

  return { init, analyse, legalMoves, applyMoves, quit };
}

/**
 * @typedef {{ multipv: number, scoreType: 'cp'|'mate', score: number,
 *   depth: number, pv: string[] }} AnalysisLine
 */

/**
 * Parse `info … multipv … score … pv …` lines, keeping the deepest info per
 * multipv index. Scores are from the side-to-move perspective (UCI); moves are
 * engine UCI (canonical). Exported for unit testing without a worker.
 * @param {string[]} lines
 * @returns {AnalysisLine[]}
 */
export function parseAnalysis(lines) {
  /** @type {Record<number, AnalysisLine>} */
  const best = {};
  for (const line of lines) {
    if (!line.startsWith('info ') || !/\bmultipv\b/.test(line)) continue;
    const mv = /\bmultipv (\d+)/.exec(line);
    const sc = /\bscore (cp|mate) (-?\d+)/.exec(line);
    const dp = /\bdepth (\d+)/.exec(line);
    const pv = /\bpv (.+)$/.exec(line);
    if (!mv || !sc || !pv) continue;
    const idx = Number(mv[1]);
    const depth = dp ? Number(dp[1]) : 0;
    if (!best[idx] || depth >= best[idx].depth) {
      best[idx] = {
        multipv: idx,
        scoreType: /** @type {'cp'|'mate'} */ (sc[1]),
        score: Number(sc[2]),
        depth,
        pv: pv[1].trim().split(/\s+/),
      };
    }
  }
  return Object.values(best).sort((a, b) => a.multipv - b.multipv);
}
