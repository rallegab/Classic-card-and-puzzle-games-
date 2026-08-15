# Solitaire

A free, ad-free classic Klondike Solitaire game that runs entirely in your
browser — no app store, no accounts, no ads, no tracking.

**Play it here:** enable GitHub Pages for this repository (see below) and
open the resulting URL on your phone, tablet, or computer.

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

## Enabling GitHub Pages

This repo includes a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that publishes the site to GitHub Pages
automatically on every push. The first time, GitHub may need Pages turned
on for the repository:

1. Go to the repository's **Settings → Pages**.
2. Under "Build and deployment", set **Source** to **GitHub Actions** (the
   workflow will usually do this automatically the first time it runs).
3. After the workflow finishes, your game will be live at:
   `https://<your-username>.github.io/<repository-name>/`

## Local development

No build tools needed. Just serve the folder with any static file server,
for example:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.
