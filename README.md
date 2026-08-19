# Chess960 game generator

A local, browser-based tool for setting up a chess or Chess960 position,
analysing it with a strong engine, and generating complete games in which a
chosen side wins. Zero dependencies — no npm, no build step, no CDN.

> This README is a work in progress; the full setup, engine-verification, and
> security-posture documentation lands in a later phase.

## Running locally

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Open `http://localhost:8000/tests/test.html` for the core test suite, and
`http://localhost:8000/tests/engine.html` for the engine + castling tests
(loads the WASM engine and verifies king-takes-rook castling across all 960
positions).

## Engine

Chess rules and analysis come from **Stockfish 18** (Lite, single-threaded WASM),
vendored in `engine/`. The single-threaded build needs no `SharedArrayBuffer`,
so it runs under a plain `python3 -m http.server` with no special headers.

- Source: npm `stockfish@18.0.8` (files `bin/stockfish-18-lite-single.{js,wasm}`),
  committed as `engine/stockfish.{js,wasm}` (renamed only — bytes unchanged).
- SHA-256 checksums and the exact fetch URLs are in
  [`engine/CHECKSUMS.txt`](engine/CHECKSUMS.txt). Verify with:

  ```
  shasum -a 256 engine/stockfish.js engine/stockfish.wasm
  ```

- Licence: Stockfish is **GPLv3** ([`engine/LICENSE.stockfish`](engine/LICENSE.stockfish)).
  This project's own source is MIT; the vendored Stockfish binary remains under
  its GPLv3 terms.

## Credits

Chess piece graphics are the **Cburnett** set by User:Cburnett (Colin M. L.
Burnett), from Wikimedia Commons, recoloured to the project palette and used
under the BSD 3-clause licence. Full attribution, source URLs, and the licence
text are in [`pieces/CREDITS.md`](pieces/CREDITS.md).

## Licence

MIT (see `LICENSE`, added in a later phase).
