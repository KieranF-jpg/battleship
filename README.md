# Battleship vs AI

A browser Battleship game where you play against a computer opponent.

**Play it:** https://kieranf-jpg.github.io/battleship/

**Bug report:** [BUGS.md](BUGS.md) lists the bugs found while testing the game and how each was fixed.

## How to play

1. **Place your fleet.** Pick a ship, then click your board to place it, or drag it from the ship list onto the board (works with touch too). Press `R` (or click **Rotate**) to switch between horizontal and vertical. Click or drag a placed ship to move it, or click **Randomize** to place the whole fleet for you.
2. **Choose the AI difficulty** and click **Start battle**, or take on today's **Daily challenge**.
3. **Fire.** Click a square in *Enemy waters*. Hits are red ✕, misses are white dots, and sunk ships turn dark red. The AI fires back after each of your shots.
4. Sink all five enemy ships (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2) before the AI sinks yours.

## Features

- **Daily challenge.** Everyone gets the same enemy fleet and the Hard AI each day (UTC). You get one attempt per day, and **Share result** copies a spoiler-free emoji summary of your shots (🌊 miss, 🟥 hit, 💥 sunk).
- **Stats and achievements.** Wins, win rate, streaks, fewest shots to win, accuracy, a record per difficulty and 11 achievements. Everything is stored in your browser's `localStorage`. Abandoning a battle counts as a loss.
- **Replay with AI radar.** After a game, **Watch replay** steps through every shot (play, scrub, or use ← →). The AI radar heatmap shows where the AI's probability model expected your ships at each point. You can also switch on the radar during a live battle.
- **Resume.** An unfinished battle is saved after every shot and picks up where you left off after a reload.
- **Pirate theme.** The ☠️ **Pirate theme** button reskins the game: a parchment sea chart, wooden hulls with sails, a Man-o'-War, Galleon, Frigate, Brigantine and Sloop, pirate wording, cannon sounds and a shower of gold doubloons when you win. The choice is remembered. Gameplay, stats, saves and the daily fleet are the same in both themes.
- **Game feel.** Splash and explosion effects, sinking flashes, screen shake, burning hits, ship hulls with a bow and stern, a victory confetti burst and synthesised sound effects (Web Audio, no audio files) with a remembered mute toggle. Animations are turned off when the system asks for reduced motion.

Every game has a random seed. The enemy fleet and every AI shot come from that seed, so a game is fully described by its seed, difficulty, your fleet and your shots (`src/match.js`). Resume, replay and the daily challenge all rebuild games from that record.

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
src/match.js      seeded matches: save, resume and replay a game from a small record
src/stats.js      lifetime stats, achievements and daily results (localStorage)
src/daily.js      daily challenge seed, numbering and share text
src/sound.js      synthesised sound effects (navy and pirate sets) and the mute setting
src/theme.js      navy and pirate themes: wording, ship names, colours
src/rng.js        seeded random numbers
src/ui.js         connects the rules to the page: rendering, clicks, drag and drop, effects, AI turn timing
tests/            unit tests (node:test) and a browser playthrough (Playwright)
scripts/          AI simulation harness
```

It's plain HTML, CSS and JavaScript modules with no build step and no runtime dependencies, so GitHub Pages serves the repo as-is.

## Running locally

```bash
npm start                 # serves on http://localhost:8080 (needs Python 3)
npm test                  # unit tests for the rules, AI, replay, stats and daily challenge
npm run simulate          # plays thousands of AI games and prints stats
npm install && npx playwright install chromium
node tests/e2e.mjs        # browser playthrough (with npm start running)
```
