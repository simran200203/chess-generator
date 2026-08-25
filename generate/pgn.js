// @ts-check
/**
 * PGN and JSON export (§9). Pure string builders — the caller supplies the
 * already-computed SAN, evaluations, classifications, result, and hopeless ply.
 *
 * PGN includes per-move eval comments, classification glyphs, the result label,
 * a Termination tag, and the ply at which the position became lost.
 */

import { hopelessLabel } from './score.js';

/** Format a White-POV eval for a PGN [%eval] tag. */
function evalTag(evalWhite) {
  if (evalWhite.type === 'mate') return evalWhite.value === 0 ? '#' : `#${evalWhite.value}`;
  return (evalWhite.value / 100).toFixed(2);
}

const RESULT_SCORE = { w: '1-0', b: '0-1' };

/**
 * @param {object} g - the annotated game
 * @param {string} g.startFen
 * @param {string[]} g.moves - engine UCI
 * @param {string[]} g.san
 * @param {string[]} g.fens
 * @param {import('./deep.js').DeepPosition[]} g.deep
 * @param {(object|null)[]} g.annotations
 * @param {{type:string, winner?:'w'|'b'}} g.result
 * @param {number|null} g.hopelessPly
 * @param {string} [g.variant] - 'Chess960' | 'Standard'
 * @param {number} [g.seed]
 * @param {string} [g.criterion]
 * @param {number} [g.whiteStrength]
 * @param {number} [g.blackStrength]
 * @param {Date} [g.date]
 * @returns {string}
 */
export function toPGN(g) {
  const winner = g.result.winner;
  const score = winner ? RESULT_SCORE[winner] : (g.result.type === 'ceiling' ? '*' : '1/2-1/2');
  const d = g.date || new Date();
  const dateStr = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

  const tags = [
    ['Event', 'Generated game'],
    ['Site', 'chess-generator'],
    ['Date', dateStr],
    ['Round', '-'],
    ['White', g.whiteStrength != null ? `Engine (strength ${g.whiteStrength.toFixed(2)})` : 'Engine'],
    ['Black', g.blackStrength != null ? `Engine (strength ${g.blackStrength.toFixed(2)})` : 'Engine'],
    ['Result', score],
    ['Annotator', 'chess-generator'],
    ['Termination', g.result.type],
  ];
  if (g.variant && g.variant !== 'Standard') tags.push(['Variant', g.variant]);
  tags.push(['FEN', g.startFen], ['SetUp', '1']);
  if (g.criterion) tags.push(['Criterion', g.criterion]);
  if (g.seed != null) tags.push(['Seed', String(g.seed)]);
  if (g.hopelessPly) {
    tags.push(['HopelessPly', String(g.hopelessPly)]);
    tags.push(['LostAt', hopelessLabel(g.hopelessPly)]);
  }

  const header = tags.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join('\n');

  // Move text with numbering derived from the start FEN.
  const fields = g.startFen.split(/\s+/);
  let fullmove = Number(fields[5] || 1);
  let side = fields[1] || 'w';
  const tokens = [];
  for (let k = 0; k < g.moves.length; k++) {
    if (side === 'w') tokens.push(`${fullmove}.`);
    else if (k === 0) tokens.push(`${fullmove}...`);

    const ann = g.annotations[k];
    // ?? ? ?! !! attach to the move; only-move is noted in the comment.
    const suffixGlyph = ann && ann.glyph !== '□' ? ann.glyph : '';
    tokens.push(g.san[k] + suffixGlyph);

    const parts = [`[%eval ${evalTag(g.deep[k + 1].evalWhite)}]`];
    if (ann) parts.push(ann.label);
    if (g.hopelessPly === k + 1) parts.push('position becomes lost here');
    tokens.push(`{ ${parts.join(' — ')} }`);

    if (side === 'b') fullmove += 1;
    side = side === 'w' ? 'b' : 'w';
  }
  tokens.push(score);

  return `${header}\n\n${wrap(tokens.join(' '))}\n`;
}

/**
 * JSON export — the full annotated game as structured data.
 * @param {object} g - same shape as toPGN's argument
 * @returns {string}
 */
export function toJSON(g) {
  const obj = {
    generator: 'chess-generator',
    variant: g.variant || 'Standard',
    startFen: g.startFen,
    result: {
      type: g.result.type,
      winner: g.result.winner || null,
      label: g.result.winner
        ? `${cap(g.result.type)} — ${g.result.winner === 'w' ? 'White' : 'Black'} wins`
        : `Draw (${g.result.type})`,
    },
    hopelessPly: g.hopelessPly ?? null,
    hopeless: g.hopelessPly ? hopelessLabel(g.hopelessPly) : null,
    seed: g.seed ?? null,
    criterion: g.criterion ?? null,
    strengths: { white: g.whiteStrength ?? null, black: g.blackStrength ?? null },
    moves: g.moves.map((uci, i) => ({
      ply: i + 1,
      uci,
      san: g.san[i],
      evalWhite: g.deep[i + 1].evalWhite,
      classification: g.annotations[i]
        ? { kind: g.annotations[i].kind, glyph: g.annotations[i].glyph, label: g.annotations[i].label }
        : null,
    })),
    evalCurveWhite: g.deep.map((d) => d.cpWhite),
  };
  return JSON.stringify(obj, null, 2);
}

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const escapeTag = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Wrap movetext at ~80 columns, PGN-style. */
function wrap(text, width = 80) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
