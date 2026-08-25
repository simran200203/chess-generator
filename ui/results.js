// @ts-check
/**
 * Results orchestration (§8, §9). Given a game with a tier-2 deep curve (from
 * generation) — or by running that deep pass on demand for any game on the
 * board (Annotate) — this classifies the moves, generates SAN, drives the
 * annotated move list and the eval graph, and wires PGN / JSON export.
 */

import { createEvalGraph } from './evalgraph.js';
import { classifyGame } from '../generate/classify.js';
import { annotateSan } from '../generate/san.js';
import { deepAnalyse } from '../generate/deep.js';
import { toPGN, toJSON } from '../generate/pgn.js';
import { hopelessLabel, computeHopelessPly } from '../generate/score.js';
import * as state from './state.js';

const $ = (sel, root) => root.querySelector(sel);

/**
 * @param {HTMLElement} root - the workspace screen element
 * @param {ReturnType<import('../engine/engine.js').createEngine>} engine
 * @param {ReturnType<import('./analyse.js').createAnalyse>} analyse
 */
export function createResults(root, engine, analyse) {
  const block = $('[data-role="results"]', root);
  const statusEl = $('[data-role="results-status"]', root);
  const graph = createEvalGraph($('[data-role="eval-graph"]', root), {
    onSeek: (ply) => analyse.game.goto(ply),
  });
  const notationBtn = $('[data-role="notation-toggle"]', root);

  /** @type {object|null} */
  let current = null; // the fully-annotated game, for export + graph

  // Keep the graph cursor in step with board navigation.
  analyse.game.subscribe(() => {
    if (current) drawGraph();
  });

  function drawGraph() {
    graph.render(current.deep.map((d) => d.cpWhite), {
      hopelessPly: current.hopelessPly,
      cursor: analyse.game.cursor,
      lostLabel: current.hopelessPly ? `lost at move ${Math.ceil(current.hopelessPly / 2)}` : '',
    });
  }

  notationBtn.addEventListener('click', () => {
    const next = analyse.getNotation() === 'san' ? 'uci' : 'san';
    analyse.setNotation(next);
    notationBtn.textContent = next === 'san' ? 'Show UCI' : 'Show SAN';
  });
  $('[data-role="export-pgn"]', root).addEventListener('click', () => {
    if (current) download('game.pgn', toPGN(current), 'application/x-chess-pgn');
  });
  $('[data-role="export-json"]', root).addEventListener('click', () => {
    if (current) download('game.json', toJSON(current), 'application/json');
  });

  /**
   * Finalise a game that already has a deep curve: classify, SAN, render.
   * @param {object} g - { startFen, moves, fens, deep, result, winner, hopelessPly, ... }
   */
  async function setGame(g) {
    block.hidden = false;
    statusEl.textContent = 'annotating…';
    const annotations = classifyGame(g, g.deep);
    const san = await annotateSan(engine, g.fens, g.moves);
    current = {
      ...g,
      variant: g.variant || (state.getMode() === 'chess960' ? 'Chess960' : 'Standard'),
      annotations, san,
    };
    analyse.setAnnotations({ annotations, san });
    analyse.setNotation('san');
    notationBtn.textContent = 'Show UCI';
    drawGraph();
    statusEl.textContent = summarise(current);
  }

  /** Run the deep pass on the current board game, then finalise it. */
  async function annotateCurrent() {
    const data = analyse.currentGameData();
    if (data.moves.length === 0) { statusEl.textContent = 'no moves to annotate'; block.hidden = false; return; }
    block.hidden = false;
    statusEl.textContent = 'analysing (deep)…';
    const deep = await deepAnalyse(engine, data.fens, {
      depth: 16, multipv: 2,
      onStep: (i, n) => { statusEl.textContent = `analysing (deep) ${i}/${n}…`; },
    });

    // Result of a hand-played game: terminal (mate/stalemate) or ongoing.
    const lastFen = data.fens[data.fens.length - 1];
    let result = { type: 'ongoing' };
    let winner = null;
    if ((await engine.legalMoves(lastFen)).length === 0) {
      const { checkers } = await engine.describe(lastFen);
      const side = lastFen.split(/\s+/)[1];
      if (checkers.length) { winner = side === 'w' ? 'b' : 'w'; result = { type: 'checkmate', winner }; }
      else result = { type: 'stalemate' };
    }
    const hopelessPly = computeHopelessPly(deep.map((d) => d.cpWhite), 800, 6);
    await setGame({ ...data, deep, result, winner, hopelessPly });
  }

  return { setGame, annotateCurrent };
}

function summarise(g) {
  const label = g.result.winner
    ? `${cap(g.result.type)} — ${g.result.winner === 'w' ? 'White' : 'Black'} wins`
    : (g.result.type === 'ongoing' ? 'Game in progress' : `Draw (${g.result.type})`);
  return g.hopelessPly ? `${label} · ${hopelessLabel(g.hopelessPly)}` : label;
}

/** Trigger a file download via Blob + object URL (§9). */
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
