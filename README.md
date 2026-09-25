# Backgammon

A two-player backgammon game that runs entirely in the browser — no build step, no server, no dependencies beyond a font from Google Fonts.

- `index.html` — page structure
- `style.css` — board and UI styling
- `game.js` — game rules and rendering

## Rules implemented

- Standard starting position, dice rolling (with doubles giving four moves)
- Blocked points, hitting blots, the bar and forced re-entry
- Bearing off, including the "higher die if nothing farther back" rule
- Win detection when a player bears off all 15 checkers
- **Two ways to play:** hot-seat 2-player, or solo against a built-in computer opponent (a simple heuristic AI — no lookahead, but it prioritizes bearing off, hitting blots, making safe points, and not leaving blots of its own)
- **Choose your side:** playing vs Computer, a "Choose your side" prompt appears at the start of every fresh match so you can pick White or Black; it locks in once you roll
- **Move by clicking or dragging:** click a die then click a checker, or just drag a checker straight to its destination (including into the bear-off tray) — the game figures out which die to use
- **Click-saving automation:** a checker on the bar, a doubles roll, and the last remaining die are all picked up for you automatically
- **Visual cues:** the checker you'd actually move glows gold; any opponent blot you can currently hit glows red; legal sources and destinations pulse clearly
- **Match play:** pick a "Match to" target before a match starts (5 by default, or any standard length); scoring follows normal backgammon rules — 1 point for a standard win, 2 for a gammon (opponent bears off nothing), 3 for a backgammon (gammon plus a checker still on the bar or in your home board). First to reach or pass the target wins the match
- **New Game vs. New Match:** New Game restarts just the current game and keeps your match score; New Match resets the score to 0–0. Both confirm first if there's real progress to lose
- **Two guidance modes:** Beginner (a rotating backgammon-term glossary plus a strategy note that reacts to the board, both near the board) and Normal (clean screen, no hints)
- **Live stats:** running scoreboard, pip count, and checkers-borne-off/remaining for both sides
- An in-game Instructions panel covering the rules, scoring, and strategy basics (making points, primes, anchors, racing vs. holding, bear-off order)

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
