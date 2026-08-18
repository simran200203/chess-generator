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

Open `http://localhost:8000/tests/test.html` to run the core test suite.

## Credits

Chess piece graphics are the **Cburnett** set by User:Cburnett (Colin M. L.
Burnett), from Wikimedia Commons, recoloured to the project palette and used
under the BSD 3-clause licence. Full attribution, source URLs, and the licence
text are in [`pieces/CREDITS.md`](pieces/CREDITS.md).

## Licence

MIT (see `LICENSE`, added in a later phase).
