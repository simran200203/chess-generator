# CLAUDE.md — Chess960 Game Generator

Instructions for Claude Code. Read this fully before writing any code.

---

## 1. What this is

A local, browser-based tool for setting up a chess or Chess960 position, analysing it with a strong engine, and generating complete games in which a chosen side wins. Built as a public portfolio repository, so code quality and README are first-class deliverables.

Two audiences: the author (a writer who needs a verified, legal, dramatically legible game to reference in fiction) and technical reviewers who will read the repo.

**Non-goals.** No multiplayer. No accounts. No backend. No database. No deployment in v1 — it runs locally.

---

## 2. Stack — decided, do not revisit

**This project has zero dependencies. There is no npm, no package.json, no node_modules, no lockfile, no bundler, no build step.**

| Concern | Decision |
|---|---|
| Language | Plain modern JavaScript, ES modules, loaded natively via `<script type="module">` |
| Framework | None. Direct DOM manipulation. |
| Build | None. Files are served as-is. |
| Engine | Stockfish WASM, vendored into `engine/` — two files, downloaded once |
| Rules | Stockfish itself. See §3. |
| Board | Hand-written. 64 divs in a CSS grid, Pointer Events for drag. |
| Charts | Hand-written SVG. |
| Fonts | Vendored `.woff2` files in `fonts/`, or a system font stack. No CDN. |
| Dev server | `python3 -m http.server 8000` (already on macOS) |

**Do not introduce any dependency, package manager, build tool, or CDN link.** If something seems to need one, write it by hand or ask first. The zero-dependency constraint is the project's defining engineering decision and is documented as such in the README.

Consequence: no TypeScript. Use JSDoc type annotations on function signatures instead — they give editor tooling without a compile step.

---

## 3. Stockfish as the rules engine

There is no chess library. Stockfish provides move legality and board state, which removes the need to write a move generator and guarantees Chess960 castling is handled correctly.

**Legal moves for a position:**

```
position fen <fen>
go perft 1
→ e2e4: 1
→ g1f3: 1
   ... (one line per legal move)
→ Nodes searched: 20
```

Parse the move list from the left column.

**Applying a move and getting the resulting position:**

```
position fen <startfen> moves e2e4 e7e5
d
→ (prints board diagram)
→ Fen: rnbqkbnr/pppp1ppp/...
```

Parse the `Fen:` line. Track games as *starting FEN plus a move list*, and derive the current FEN from the engine when needed. Never maintain a parallel board representation — that is where bugs come from.

**Game-over detection:** a position with zero legal moves is checkmate or stalemate. Distinguish by whether the side to move is in check, which the engine reports as a mate score. Threefold repetition and the fifty-move rule are tracked from the move list.

---

## 4. Chess960 core (`core/`)

Pure functions, no DOM access. Build first, test first.

### Three representations, all interconvertible

1. **Back-rank string** — 8 chars from `{R,N,B,Q,K}`, files a→h. Example: `BNRNQKBR`.
2. **Position ID** — Scharnagl numbering, 0–959. Standard chess is **518**.
3. **FEN** — consumed by the board and the engine.

Round-trip conversion must be verified across all 960 IDs.

### Validation rules for a back-rank string

- Exactly 8 characters
- Exactly 2×R, 2×N, 2×B, 1×Q, 1×K
- Bishops on opposite-coloured squares
- King strictly between the two rooks

Each failure returns a **specific** message naming the broken rule. Never a generic "invalid position".

### Both sides share the same back rank

White's rank 1 and Black's rank 8 use the **same arrangement on the same files**, not mirrored left-to-right. A bishop on a1 means a bishop on a8.

### Gotcha 1 — castling rights notation

Standard FEN writes `KQkq`, which is ambiguous after promotions when more than two rooks exist. Use **Shredder-FEN / X-FEN internally**, encoding the rook's file letter: rooks on c and h give `CHch`.

### Gotcha 2 — castling in UCI move notation

With `UCI_Chess960 true`, Stockfish encodes castling as **king-takes-own-rook**. A kingside castle from f1 with a rook on h1 is emitted as `f1h1`, not `f1g1`.

This is the highest-risk correctness bug in the project. The board UI must translate it for display, and any move the UI sends back must use the engine's convention. Test castling in every one of the 960 positions.

### Standard chess mode

Identical code path. Back rank locked to `RNBQKBNR`, `UCI_Chess960` set to `false`.

### Testing without a test framework

There is no test runner. Write `tests/test.html` — a page that imports the core modules, runs assertions, and prints pass/fail to the page and console. Open it in the browser. Roughly thirty lines of harness, and it works forever with no maintenance.

---

## 5. Engine layer (`engine/`)

### Vendoring

Download the official Stockfish WASM build once. Commit `stockfish.js` and `stockfish.wasm` to `engine/`. Load with `new Worker('./engine/stockfish.js')`.

Record in the README: the release URL, exact version, and **SHA-256 checksum** of each file, with the `shasum -a 256` command a reader can run to verify.

### Worker wrapper

The engine runs in a Web Worker — never the main thread, which would freeze the UI.

Expose a promise-based API so no other module writes raw UCI:

```js
await engine.analyse(fen, { depth: 12, multipv: 3 })
await engine.legalMoves(fen)
await engine.applyMoves(fen, moves)
```

Underlying protocol:

```
uci
setoption name UCI_Chess960 value true
setoption name MultiPV value 3
position fen <fen> moves f1h1 g8f6
go depth 12
→ info depth 12 multipv 1 score cp 34 pv e2e4 ...
→ bestmove e2e4
```

### Threading

Use the **single-threaded** build. The multi-threaded build needs `SharedArrayBuffer`, which requires COOP/COEP headers the plain Python server does not send. Single-threaded is slower but has no server requirements at all.

### Two instances

Two engine workers, one per side, so asymmetric strength settings don't require reconfiguring between moves.

---

## 6. Determinism and strength asymmetry

Both are solved by the same mechanism. The obvious approach is wrong.

**Do not use Stockfish's `Skill Level` option.** Its error injection is internally random and cannot be seeded, which destroys reproducibility.

**Instead:**

1. Request `MultiPV 3` — the top three moves with evaluations.
2. Select among them using **your own seeded PRNG**, weighted by that side's strength setting. A strong side takes the top move nearly always; a weaker side has a meaningful chance of taking line two or three.
3. An identical seed reproduces an identical game.

Use `mulberry32` — about five lines, written in-house.

This gives full determinism, direct control over each side's strength, and **realistic** error: the weaker side plays a plausible inferior move, not a random legal one. That realism is the point — the generated game must read as a real game.

### Seed handling

Displayed in the UI and editable. Blank means random. Pasting a previous seed regenerates that game exactly.

---

## 7. Generation pipeline (`generate/`)

```
verified starting position + constraints
            ↓
   generate N candidate games      ← TIER 1: shallow depth, fast, disposable
            ↓
   filter: did the target side win?
            ↓
   score survivors by chosen criterion
            ↓
   select single winner
            ↓
   re-analyse winner               ← TIER 2: deep, full annotation
            ↓
   render + export
```

**Tier 1:** each candidate at low depth (~8), MultiPV 3. Most are discarded.

**Tier 2:** only the selected game, every move at high depth (~18), MultiPV 1, producing the evaluation curve and move classifications.

This split is what makes browser-side generation viable — deep analysis is paid for once.

### Constraints exposed to the user

- **Target outcome:** White wins / Black wins / Draw / Either side wins
- **Strength per side:** independent sliders, defaulting from the target outcome (the side chosen to lose gets the weaker setting), with manual override
- **Convergence criterion:** dropdown, see below
- **Candidate count:** how many games to play out
- **Seed:** editable, blank for random

**There is no move-count constraint.** Do not implement one.

### Termination safety

Games end by the rules of chess (checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material) or by a hard ply ceiling as an internal safety net. The ceiling is **not** user-facing. A game hitting it is discarded, not returned.

### Convergence criteria

Each is a scoring function over an annotated game. All are winner-agnostic — they refer to "the winner", not to Black.

| Criterion | Scores by |
|---|---|
| **Largest evaluation swing** | Biggest single turning point. The default. |
| **Cleanest play by the winner** | Fewest inaccuracies, mistakes and blunders by the winning side |
| **Shortest decisive game** | Fewest moves to a decisive result |
| **Most gradual** | Loser's errors spread across many moves rather than concentrated — reads as slow strangulation |

Adding a fifth later must require one function and one dropdown entry.

### Result type

Engine self-play rarely produces actual checkmate; it produces a hopeless position. **Accept both**, and label which occurred: `checkmate` or `decisive` (evaluation passed a threshold and stayed there). Surface this in the UI and the exported PGN — the two describe different endings.

If no candidate satisfies the constraints, say so explicitly and name which constraint to relax. Never hang. Never silently return a game that doesn't meet spec.

---

## 8. Move classification

Convert centipawns to win probability, then classify by the drop the played move caused relative to the engine's best.

```js
const winPct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
```

| Drop in win % | Label | Glyph |
|---|---|---|
| ≥ 30 | Blunder | `??` |
| ≥ 20 | Mistake | `?` |
| ≥ 10 | Inaccuracy | `?!` |
| otherwise | — | — |

Plus two heuristic labels, which are what make the output read as *narration* rather than data:

- **Only move** — the second-best alternative is far worse
- **Brilliant** — material is given up and the evaluation holds or improves

These thresholds match Lichess's scheme, deliberately: chess-literate readers will recognise it. Note this in the README.

---

## 9. User flow

```
LAUNCH
  └─ Mode select:  Chess  |  Chess960
        │
        ├─ Chess ──────────────► WORKSPACE (standard position, ready)
        │
        └─ Chess960 ──► SETUP ──► [Board Ready] ──► WORKSPACE
```

### Setup screen (Chess960 only)

Empty back rank, piece tray at the side holding exactly 2×R, 2×N, 2×B, 1×Q, 1×K.

Three input methods, all writing to the same state:

1. **Drag from tray to rank 1.** The tray depletes as pieces are placed, so over-placement is impossible. Placed pieces can be dragged elsewhere, swapped, or returned to the tray.
2. **Type a back-rank string** (`BNRNQKBR`).
3. **Randomise** — a legal position 0–959.

**Autocomplete:** when the placed pieces admit exactly one legal completion of the rank, offer to complete it. Check after every placement.

**Live validation, not blocking.** Allow free placement. Show a continuously-updating status line naming what is still wrong ("both bishops on light squares", "king not between rooks"). More informative than a square that silently refuses a piece. **Board Ready** is disabled until valid.

**Live tri-representation sync.** Back-rank string, position ID and FEN are always visible and always update together, whichever input method was used. Dragging a piece changes the ID in real time.

**Mirrored black rank.** Rank 8 fills in live as rank 1 is built.

**Board Ready** transitions to the workspace.

### Workspace

Board plus a right-hand panel toggling between **Analyse** and **Generate**. A single workspace, not a second mode choice — the user will examine a position before generating from it.

**Analyse:** step through positions, top three engine moves with evaluations, evaluation bar alongside the board.

**Generate:** the constraints from §7, then a live progress panel:

```
game 23 / 40 · 6 qualifying · best so far: swing 4.2
[cancel]
```

Render the current best-so-far game on the board while the remaining candidates play out. This turns waiting time into the most demonstrable thing in the app.

**Results:** annotated move list with classification glyphs, evaluation graph, PGN and JSON export via a download link built with `Blob` and `URL.createObjectURL`. PGN includes comments, evaluations and the result label.

### Navigation

- **Back** — returns to setup. Warn if a generated game would be lost.
- **Reset** — returns the board to the chosen starting position without leaving the workspace.

### Feature parity

Standard chess mode gets the full feature set including generation. Same code path, one flag.

---

## 10. Visual direction

The register is **tournament analysis instrument**, not consumer chess app. Precise, quiet, slightly clinical. "Premium" here means restraint and precision in spacing and type, not decoration.

### Tokens

```
--ground        #1B2027   deep slate, hued not near-black
--surface       #252B33   panels
--board-light   #D8CFC0   bone
--board-dark    #6E7A6B   muted sage — deliberately not the standard brown/green
--signal        #E0A63C   amber; evaluation, active states, the one accent
--text          #E8E6E1
```

Amber is the only accent. Do not introduce a second.

### Type

- **Display:** Spectral — a screen-first serif with technical rather than editorial warmth. Used sparingly, at large sizes.
- **Body / UI:** IBM Plex Sans
- **Data, notation, back-rank strings:** IBM Plex Mono — mandatory for anything positional, so characters align

Vendor the `.woff2` files into `fonts/` and declare them with `@font-face`. No CDN. If vendoring is deferred, fall back to a system stack rather than adding a network dependency.

### Signature element

**The position dial on the setup screen.** The position ID rendered very large in mono, back-rank string beneath it, both updating live as pieces are dragged. It is the one thing Chess960 has that standard chess does not, and it should be the most visually arresting element in the app. Spend the boldness here; keep everything else disciplined.

### Motion

Piece drop with a real easing curve. Evaluation bar transitions smoothly. Nothing else animates. Respect `prefers-reduced-motion`.

### Responsive

Desktop-first. Scales down: board shrinks, panel stacks below, touch drag works via Pointer Events. Desktop wins any layout conflict.

### Quality floor

Visible keyboard focus. Board navigable by keyboard. ARIA labels on squares and pieces.

### Copy

Active voice, sentence case, plain verbs. A control names exactly what happens: "Board Ready", not "Submit". Errors state what is wrong and how to fix it, without apologising. Empty states invite an action.

---

## 11. Security

The zero-dependency architecture removes most of the attack surface by construction rather than by mitigation. Document this posture in the README — it is worth more to a technical reviewer than the feature list.

- **No package manager, no registry, no install step.** Supply-chain compromise of the npm ecosystem — the Shai-Hulud worm family and its 2026 variants — cannot affect this project, because no third-party code is ever fetched.
- **The only vendored binary is Stockfish**, committed with a published SHA-256 checksum. The exact bytes are pinned by being in git.
- **No network calls at runtime.** No CDN, no analytics, no remote fonts. The app works fully offline.
- **No secrets, no `.env`, no backend.**

Code-level: validation lives in the module that owns the data, not scattered across the UI. Engine input is constructed programmatically, never concatenated from raw user text.

### README requirements

Setup instructions that work from a clean clone (clone, run `python3 -m http.server 8000`, open the page — that is the whole thing). Engine version, source URL and checksums with the verification command. An explanation of the zero-dependency posture. MIT licence.

---

## 12. Build order

Work through these in order. Do not begin a phase before the previous one works.

1. **Chess960 core** (`core/`). Back-rank parsing and validation, Scharnagl mapping across all 960, FEN and Shredder-FEN generation, castling rights. Plus `tests/test.html`. No UI.
2. **Board and setup screen.** All three input methods, autocomplete, live validation, mirrored black rank, tri-representation sync, Board Ready transition.
3. **Engine worker.** Vendoring, UCI wrapper, `perft 1` legal-move parsing, the king-takes-rook translation with tests, single-position analysis.
4. **Analyse mode.** Top-three moves, evaluation bar, stepping through positions.
5. **→ Ship this as v1.** Complete and demonstrable on its own.
6. **Seeded PRNG and a single self-play game.**
7. **Convergence loop.** Criteria, scoring, progress UI, cancellation, best-so-far rendering.
8. **Move classification, evaluation graph, PGN and JSON export.**
9. **README, licence, checksum documentation.**

---

## 13. Working agreement

- Explain trade-offs before implementing anything not specified here. Do not silently choose.
- Write tests alongside the core and translation layers, not afterwards.
- Where this document and Stockfish's actual behaviour disagree, **verify the engine** and report back rather than assuming this document is right.
- **Never add a dependency, package manager, build tool, or CDN link.** If you believe one is genuinely necessary, stop and explain why rather than adding it.
