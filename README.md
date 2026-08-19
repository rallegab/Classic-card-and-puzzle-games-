# Classic Card & Puzzle Games

A small collection of free, ad-free browser games — no app store, no
accounts, no ads, no tracking. The site root is a main menu for picking a
game; each game is otherwise a separate, self-contained folder (its own
HTML/CSS/JS and service worker), so they don't share code or affect one
another.

- **[Solitaire](solitaire/)** — classic Klondike. See
  [`solitaire/README.md`](solitaire/README.md).
- **[Mahjong Solitaire](mahjong/)** — the classic tile-matching pairs game.
  See [`mahjong/README.md`](mahjong/README.md).

**Play them here:** enable GitHub Pages for this repository (see below) and
open the resulting URL on your phone, tablet, or computer — you'll land on
the menu, which links to Solitaire at `/solitaire/` and Mahjong Solitaire at
`/mahjong/`. Each game also has a "🏠 Main Menu" link in its own in-game
menu, to come back and switch games.

## Local development

No build tools needed. Just serve the repository root with any static file
server, for example:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser to reach the main menu
(or jump straight to `http://localhost:8000/solitaire/` or
`http://localhost:8000/mahjong/`).

## Enabling GitHub Pages

This repo includes a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that publishes the whole site (the menu and
both games) to GitHub Pages automatically on every push. The first time,
GitHub may need Pages turned on for the repository:

1. Go to the repository's **Settings → Pages**.
2. Under "Build and deployment", set **Source** to **GitHub Actions** (the
   workflow will usually do this automatically the first time it runs).
3. After the workflow finishes, the menu will be live at:
   `https://<your-username>.github.io/<repository-name>/`, with Solitaire at
   `.../solitaire/` and Mahjong Solitaire at `.../mahjong/`.
