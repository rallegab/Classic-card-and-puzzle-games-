# Solitaire

A free, ad-free classic Klondike Solitaire game that runs entirely in your
browser — no app store, no accounts, no ads, no tracking.

This is a separate, self-contained game living alongside the Mahjong
Solitaire game in this repo; it shares no code or assets with it. Open
`index.html` here (or `/solitaire/` once the site is deployed) to play, or
use the main menu at the site root to get to it.

## Features

- Classic Klondike rules, with a Draw 1 / Draw 3 option
- Works on touch screens: drag a card with your finger, or tap it to send
  it home (or to any open spot) automatically
- Right/left-handed layout, so the stock pile can sit within thumb reach
- Undo, a New Game confirmation, move counter, timer, an "Auto Finish"
  button once you've won, and optional sound effects
- A few photo backgrounds to pick from in the menu, alongside the classic
  felt table
- Installable to your phone's home screen for an app-like, full-screen feel
  (open the site in Chrome, then use the browser menu → "Add to Home
  screen")
- Works offline once loaded, thanks to a small service worker
- No build step — it's plain HTML, CSS, and JavaScript

## Local development

No build tools needed. Serve the repository root with any static file
server and open `/solitaire/`, for example:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/solitaire/` in your browser.
