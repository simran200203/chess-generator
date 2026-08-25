# Chess960 game generator

Regular chess starts every game from the same row of pieces. Because that
starting position never changes, players have spent centuries memorising long
sequences of good opening moves, and there are databases holding millions of
recorded games to study. Chess960 — also called Fischer Random — changes one
thing: at the start of each game the back row is shuffled into one of 960
possible arrangements. That wipes out the memorised openings, because nobody has
studied these positions, and that is the whole appeal: both players have to
think for themselves from the very first move.

The catch is that it also leaves you with nothing to look up. Suppose you want a
particular kind of game from a particular shuffled starting position — say, one
where White wins slowly by squeezing Black, or one where Black wins with a sharp
attack. In ordinary chess you could search a database for a game like that. In
Chess960 you usually can't, because for most of these positions no such game has
ever been played or written down. This tool makes one for you. You choose the
starting position and the kind of result you want, and it plays out games until
it finds one that fits, then walks you through it move by move.

## What it does

- **Set up a position.** Pick one of the 960 starting arrangements, type it in,
  drag the pieces yourself, or roll a random one.
- **Explore it with a chess engine** — a program that plays and judges chess far
  better than any human. You can see its top suggestions and who it thinks is
  ahead at any point.
- **Generate a complete game with the ending you asked for** — White wins, Black
  wins, or a draw — and pick the *style* of game, such as the one with the
  biggest single turning point, the cleanest win, the shortest, or the most
  gradual grind.
- **Read the finished game move by move.** Mistakes are marked, a small graph
  shows who was ahead throughout, and it points to the exact move where the
  losing side's position became hopeless. You can save the game to a file.

That last point — naming the move where the game was effectively decided — is the
thing the tool is really built to answer.

![The workspace: board on the left, analysis and generation controls on the right.](docs/screenshot.png)

## Running it

There is nothing to install — no accounts, no build step, no downloading of
extra software. You need Python, which already comes with macOS and most Linux
systems, only to serve the files to your browser.

```
git clone https://github.com/simran200203/chess-generator.git
cd chess-generator
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a web browser. It runs entirely on your own
machine and works offline.

To run the built-in checks, open <http://localhost:8000/tests/test.html> (fast,
no engine) and <http://localhost:8000/tests/engine.html> (loads the engine and
verifies the trickiest rules).

---

The rest of this document explains how the tool works and why it's built the way
it is. If you only want to use it, you can stop here.

## Built with zero dependencies, on purpose

Most web projects pull in dozens or hundreds of pieces of third-party code,
downloaded automatically from the internet when the project is set up. This one
pulls in none. Everything is either written by hand or committed directly into
this repository as a fixed, inspectable copy. There is no package manager, no
build step, and nothing is fetched from anywhere while the tool runs.

The trade-off is real: it meant hand-writing things that a library would
normally give you for free — the board and its drag-and-drop, the evaluation
graph, the game-export files. That was more work. In return, the whole project
is small enough to read end to end, it will keep working years from now with no
maintenance, and it is immune to a whole class of security problem. When
software automatically downloads code from public registries, a single
compromised package anywhere in that chain can quietly inject malicious code
into your project. Because this tool downloads nothing, that can't happen to it.

## How the games are generated

The tool does **not** prove that one side can force a win. That is a much harder
question than it sounds: for almost any position, checking it properly would mean
searching a tree of possible continuations so vast that no computer could finish
in any reasonable time. It simply isn't tractable.

So instead of proving anything, the tool **samples and filters**. It works in
two tiers:

1. It plays out many complete candidate games quickly, using shallow (fast, less
   accurate) analysis. Most are thrown away.
2. It keeps only the games that ended the way you asked, scores those by your
   chosen style, picks the single best one, and re-analyses just that one game
   slowly and deeply.

Paying for deep analysis only once, on the winner, is what makes this practical
to run in a browser. The trade-off is that you get a genuine, realistic-looking
game that matches your request — not a mathematical guarantee that such a game is
forced. And if none of the sampled games match what you asked for, the tool says
so plainly and suggests which setting to relax, rather than hanging or handing
back something that doesn't fit.

Two more design choices matter here:

- **Believable losing.** For a game to end decisively, the losing side has to
  actually go wrong — but in a way that reads as real play, not as random
  nonsense. Each side is given a strength setting. A weaker side still chooses
  from the engine's top handful of moves, just occasionally taking the second- or
  third-best one: a plausible slip rather than an absurd blunder.
- **Reproducibility.** Every run is driven by a *seed* — a starting number for
  the tool's own random choices. Enter the same seed with the same settings and
  you get the exact same game back, every time. (The engine has a built-in
  "skill level" setting that would have been the obvious tool for weakening a
  side, but its mistakes can't be reproduced, so it isn't used; the weakening is
  done with a seedable method written here instead.)

Games end by the normal rules of chess — checkmate, or a position so lost that
the result is no longer in doubt, or one of the standard draw rules. There is
also an internal safety limit so a game can never run forever; it isn't shown in
the interface, and any game that hits it is discarded rather than returned.

## The Chess960 castling problem

Castling is the one chess move where two pieces — the king and a rook — move at
once. In ordinary chess the king and rooks always start on the same squares, so
castling is simple. In Chess960 they start on shuffled squares, which makes two
things surprisingly fiddly, and getting them wrong is the easiest way to produce
illegal games. Both are handled here:

- **Writing down where the rooks are.** The usual shorthand for castling rights
  becomes ambiguous once the pieces are shuffled, so internally the tool records
  the rook's actual file (column) instead.
- **How the engine writes a castling move.** The engine encodes castling as "the
  king moves onto its own rook's square," which looks wrong to a person expecting
  the king to land two squares over. The tool translates that into something
  readable for display, and translates any move you make back into the engine's
  form.

This is the highest-risk area for bugs, so castling is tested against the engine
in every one of the 960 starting positions.

## The chess engine (Stockfish)

The analysis and the rules of chess both come from **Stockfish**, one of the
strongest chess programs in the world, which is free and open-source. It is used
here as a **WebAssembly** build — a format that lets a program written in a
low-level language run inside an ordinary web browser.

A copy of Stockfish is committed directly into this repository (in `engine/`)
rather than downloaded, so the exact version is pinned and can be checked.

- Version: **Stockfish 18** (the "Lite", single-threaded browser build). The
  single-threaded build was chosen deliberately: the faster multi-threaded build
  requires special web-server settings that the plain `python3` server above
  can't provide, so it wouldn't run with no setup.
- Source: the npm package `stockfish@18.0.8`, files
  `bin/stockfish-18-lite-single.js` and `.wasm`, committed here as
  `engine/stockfish.js` and `engine/stockfish.wasm` (renamed only — the bytes
  are unchanged).

Each committed file carries a **SHA-256 checksum** — a short fingerprint that
changes completely if even one byte of the file changes. You can confirm the
files haven't been tampered with by running this from the project folder and
comparing the output to `engine/CHECKSUMS.txt`:

```
shasum -a 256 engine/stockfish.js engine/stockfish.wasm
```

```
5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391  engine/stockfish.js
a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1  engine/stockfish.wasm
```

Stockfish is licensed under the GNU General Public License v3, included at
`engine/LICENSE.stockfish`. This project's own code is under the MIT licence
(below); the vendored Stockfish binary stays under its own GPLv3 terms.

## The chess pieces

The piece images are the well-known **Cburnett** set by Colin M. L. Burnett,
from Wikimedia Commons, recoloured to match this project's palette. They are used
under the BSD 3-clause licence. Full attribution, source links, and the licence
text are in [`pieces/CREDITS.md`](pieces/CREDITS.md).

## How moves are graded

When you view a finished game, each move is graded by how much it changed the
player's chances of winning — converting the engine's numeric evaluation into a
win probability and measuring the drop the move caused. A move that throws away a
lot is a blunder, a smaller loss is a mistake, a smaller one still is an
inaccuracy. These cut-offs deliberately match the ones used by **Lichess**, the
popular free chess site, so anyone familiar with its analysis will recognise
them.

Two positive labels are also applied: **only move** (there was really just one
good option) and **brilliant** (a move that gives up material yet keeps the
advantage). The "brilliant" label is a rough heuristic — an approximation that
will sometimes miss a real one or flag one that isn't — because detecting a
genuine sacrifice reliably takes deeper analysis than this does. It's flagged as
approximate rather than presented as certain.

## Licence

This project's source code is released under the MIT licence — see
[`LICENSE`](LICENSE). The vendored Stockfish engine (GPLv3) and Cburnett pieces
(BSD 3-clause) keep their own licences, as noted above.
