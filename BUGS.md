# Bug report: Battleship vs AI

This document covers how the game was tested, the bugs that testing found, and how each one was fixed. Every fix has an automated test so the bug can't come back unnoticed.

## How the game was tested

| Layer | What it checks | How to run it |
|---|---|---|
| Unit tests (42) | Ship placement rules (edges, overlaps, moving a ship), hit/miss/sunk results, rejecting repeat and out-of-bounds shots, turn order, win detection, the AI's targeting behaviour (including 600 simulated games), seeded replay and resume, stats, achievements, the daily challenge, power-ups, campaign progress, themes and the Tips guide | `npm test` |
| AI simulation | Plays 6,000 full games (2,000 per difficulty) against random fleets. Fails if the AI ever fires at the same square twice, fires off the board, or needs more than 100 shots | `npm run simulate` |
| Browser playthrough (84 checks) | Drives the real page in Chromium with Playwright: placing and dragging ships by mouse, touch and keyboard, rotating, randomizing, double-clicking, clicking during the AI's turn, playing a full game, dismissing the end screen, restarting, replay, resume after reload, the daily challenge, both themes, Tips, power-ups, the campaign, a battle with audio blocked, and checking for console errors | `node tests/e2e.mjs` |
| Visual review | Screenshots at desktop (1280px) and phone (390px) widths, checked by eye | (manual) |

## Bugs found and fixed

### 1. Closing the end-of-game popup with Escape left no way to start a new game

- **Symptom:** When a game ended, a "Victory!" or "Defeat" popup appeared with a **Play again** button. Pressing `Escape` closed the popup, which browsers do by default for dialogs. The setup panel was still hidden, so the page had no button left to start another game except a page reload.
- **How it was found:** The browser playthrough presses `Escape` on the end screen and then checks that a new game can still be started. That check failed.
- **Root cause:** The **Play again** button inside the popup was the only way to restart.
- **Fix:** Added a **New game** button to the status bar. It appears as soon as a battle starts and is highlighted once the game is over, so restarting no longer depends on the popup. Starting a new game mid-battle asks for confirmation first, so one stray click can't throw away a game.
- **Regression test:** `tests/e2e.mjs`, "player can still start a new game after dismissing the dialog with Escape".

### 2. On desktop the two boards stacked vertically instead of sitting side by side

- **Symptom:** At a normal laptop width (1280px), "Enemy waters" appeared below "Your fleet". Players had to scroll up and down between their own board and the board they were firing at.
- **How it was found:** Reviewing the desktop screenshot.
- **Root cause:** The ship-name list under each board (Carrier, Battleship, …) stayed on one line, which made it about 470px wide, wider than the 416px board itself. Two of those columns plus the gap came to more than the page's 928px content width, so the layout wrapped the second board onto a new row.
- **Fix:** Capped the ship list at the board's width so it wraps under the board, and widened the main column slightly. The boards now sit side by side on desktop and still stack on phones.
- **Regression check:** Desktop and phone screenshots taken after the fix.

### 3. Keyboard users got no preview when placing ships

- **Symptom:** With a mouse, hovering over your board shows a green (fits) or red (doesn't fit) outline of the ship before you place it. If you moved around the board with `Tab` instead, no outline appeared, so you were placing ships blind.
- **How it was found:** Code review of the placement controls, then confirmed with a browser test that moves keyboard focus onto a square and checks for the preview.
- **Root cause:** The preview was only updated on `mouseover` events.
- **Fix:** The preview now also updates on `focusin`, so keyboard focus behaves like the mouse.
- **Regression test:** `tests/e2e.mjs`, "keyboard focus shows placement preview".

### 4. `npm test` failed on Node 22 and later

- **Symptom:** `npm test` reported a single failing "tests" test and ran none of the real tests.
- **How it was found:** Running the suite on Node 24.
- **Root cause:** The script was `node --test tests/`. Newer Node versions treat that argument as a file to run rather than a folder to search, so they tried to execute the folder itself.
- **Fix:** The script now passes the test files explicitly (`node --test tests/*.test.js`), which works on every Node version with `node:test`.
- **Regression check:** `npm test` runs all the unit tests (42 today).

### 5. The game froze after a shot when the browser blocked audio

- **Symptom:** Early in a battle, after firing a shot, the game stopped responding. The AI never fired back and the enemy board stayed locked. Only a page reload fixed it.
- **How it was found:** Found while playing the live game and reported by the product owner: "I press a button early on and it freezes; I have to refresh."
- **Root cause:** After the player's shot, the game hands the turn to the AI, but the AI's move was only scheduled at the end of the click handler, after the sound, the board redraw and the hit effects. If any of those threw (for example when the browser blocks or doesn't support `AudioContext` on the first sound), the AI's move was never scheduled, so the game stayed on the AI's turn forever. A reload worked because the saved battle is rebuilt from its record.
- **Fix:** The AI's move is now scheduled straight after the shot, before any sound or effects run, and sound and effects are wrapped so they can never break the game. An older-Safari incompatibility (`structuredClone` in the stats code) was replaced at the same time. Fixed in [PR #4](https://github.com/KieranF-jpg/battleship/pull/4).
- **Regression test:** `tests/e2e.mjs`, "battle keeps going when audio fails". It makes `AudioContext` throw, fires a shot and checks the AI replies and the board unlocks.

### 6. On phones a ship couldn't be dragged from the list onto the board

- **Symptom:** On a phone the ship list sits at the top of the screen and the board starts below it, off-screen. Holding a ship and dragging down didn't scroll the page, so there was nowhere to drop it.
- **How it was found:** A touch-drag check at phone size (390×844) after the player reported dragging didn't work.
- **Root cause:** Ship buttons use `touch-action: none` so the browser doesn't scroll mid-drag, and nothing scrolled the page instead.
- **Fix:** While a finger holds a ship near the top or bottom edge, the page scrolls and the drop preview follows. Mouse drags are left alone, since a mouse wheel can still scroll. Covered by "touch drag scrolls down to the board and places the ship".

## Problems checked for and covered by tests

These are common bugs in turn-based browser games. The code guards against them, and the tests confirm each guard works:

- **Double-clicking fires two shots.** After each shot the enemy board locks until the AI has replied, and the game itself rejects a shot when it isn't the player's turn. Covered by "double-click fires once" and "no extra shot during AI turn".
- **Firing at the same square twice wastes a turn.** Repeat shots are ignored and the player keeps their turn. Covered by the unit test "repeat shot does not cost the turn".
- **The AI fires again after you restart.** If you click New game while the AI is "thinking", its pending move is cancelled, so it can't land on the fresh board. Covered by "play again resets boards and no stray AI shot".
- **The AI shoots a square twice or gets stuck.** Ruled out by 600 simulated games in the unit tests and 6,000 more in `npm run simulate`.
- **An empty board counts as "all ships sunk".** A board with no ships is not treated as defeated, so the game can't end before it starts. Covered by a unit test.
