# Mahjong Solitaire

A free, ad-free Mahjong Solitaire (tile-matching pairs) game that runs
entirely in your browser — no app store, no accounts, no ads, no tracking.

This is a separate, self-contained game living alongside the Solitaire card
game in this repo; it shares no code or assets with it. Open `index.html`
here (or `/mahjong/` once the site is deployed) to play, or use the main
menu at the site root to get to it.

## Features

- 144 tiles across the full traditional set: Dots, Bamboo and Character
  suits (1-9), Winds, Dragons, and the Flower/Season bonus tiles (any
  flower matches any flower, any season matches any season)
- Every deal is generated to guarantee a solvable layout exists
- Tap a tile, then tap its match — only uncovered tiles that are open on
  the left or right side can be picked
- Hint (flashes a currently-available match) and Shuffle (reshuffles the
  tiles still on the board, keeping the layout solvable) for when you get
  stuck
- Undo, a New Game confirmation, move counter, timer, and optional sound
  effects
- Four table themes: Lacquer, Jade, Lantern and Ink Wash
- Installable to your phone's home screen and works offline, thanks to a
  small service worker
- No build step — it's plain HTML, CSS, and JavaScript

## Local development

No build tools needed. Serve the repository root with any static file
server and open `/mahjong/`, for example:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/mahjong/` in your browser.
