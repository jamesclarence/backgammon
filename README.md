# Backgammon

A two-player, hot-seat backgammon game that runs entirely in the browser — no build step, no server, no dependencies beyond a font from Google Fonts.

- `index.html` — page structure
- `style.css` — board and UI styling
- `game.js` — game rules and rendering

## Rules implemented

- Standard starting position, dice rolling (with doubles giving four moves)
- Blocked points, hitting blots, the bar and forced re-entry
- Bearing off, including the "higher die if nothing farther back" rule
- Win detection when a player bears off all 15 checkers

Not implemented: the doubling cube, and full "must use both dice if only one is playable" maximization logic — the game simply won't let you use a die that has no legal move.

## Running it locally

You don't need to install anything. Just open `index.html` in a browser:

- **Easiest:** double-click `index.html` in your file browser.
- **Or, from a terminal**, from inside the project folder:
  - macOS: `open index.html`
  - Windows: `start index.html`
  - Linux: `xdg-open index.html`

If you'd rather serve it over a local web server (some browsers are stricter about file:// pages), from inside the folder run:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000` in your browser.

## Putting it on GitHub

1. **Create a repository.** Go to [github.com/new](https://github.com/new), give it a name (e.g. `backgammon`), and create it — you can leave it empty (no README/license) since you already have files.
2. **Install Git** if you don't have it: [git-scm.com/downloads](https://git-scm.com/downloads).
3. **Open a terminal in this project folder** (the one containing `index.html`, `style.css`, `game.js`).
4. **Initialize and commit your code:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: backgammon game"
   ```
5. **Connect it to the GitHub repo you created** (GitHub will show you this exact URL on the new repo page — copy it from there):
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/backgammon.git
   git branch -M main
   git push -u origin main
   ```
6. **Done.** Refresh the GitHub repo page and your three files should be there.

### Optional: host it live with GitHub Pages

Since this is a static site, GitHub can host it for free:

1. In your repo on GitHub, go to **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Set **Branch** to `main` and folder to `/ (root)`, then **Save**.
4. After a minute, your game will be live at `https://YOUR-USERNAME.github.io/backgammon/`.

### Making future changes

After editing any file:

```bash
git add .
git commit -m "Describe what you changed"
git push
```
