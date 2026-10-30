# Battleship vs AI

A browser Battleship game where you play against a computer opponent.

**Play it:** https://kieranf-jpg.github.io/battleship/

**Bug report:** [BUGS.md](BUGS.md) lists the bugs found while testing the game and how each was fixed.

## How to play

1. **Place your fleet.** Pick a ship, then click your board to place it. Press `R` (or click **Rotate**) to switch between horizontal and vertical. Click a placed ship to pick it up and move it, or click **Randomize** to place the whole fleet for you.
2. **Choose the AI difficulty** and click **Start battle**.
3. **Fire.** Click a square in *Enemy waters*. Hits are red ✕, misses are white dots, and sunk ships turn dark red. The AI fires back after each of your shots.
4. Sink all five enemy ships (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2) before the AI sinks yours.

## The AI

| Difficulty | Strategy | Average shots to sink a fleet* |
|---|---|---|
| Easy | Fires at random squares | ~95 |
| Medium | Searches in a checkerboard pattern. After a hit, it tries the squares next to the hit, then keeps going along the line of hits | ~51 |
| Hard | For every square, counts how many ways the remaining ships could still fit over it, and fires at the most likely square. After a hit, it only counts placements that pass through the hit squares | ~44 |

\* Measured over 2,000 games each with `npm run simulate`.

## Project layout

```
index.html        page markup
style.css         styles (responsive down to phone width)
src/game.js       game rules: board, ship placement, shots, turns, win detection (no DOM code)
src/ai.js         the AI opponent at three difficulty levels
src/ui.js         connects the rules to the page: rendering, clicks, AI turn timing
tests/            unit tests (node:test) and a browser playthrough (Playwright)
scripts/          AI simulation harness
```

It's plain HTML, CSS and JavaScript modules with no build step and no runtime dependencies, so GitHub Pages serves the repo as-is.

## Running locally

```bash
npm start                 # serves on http://localhost:8080 (needs Python 3)
npm test                  # unit tests for the rules and the AI
npm run simulate          # plays thousands of AI games and prints stats
npm install && npx playwright install chromium
node tests/e2e.mjs        # browser playthrough (with npm start running)
```
