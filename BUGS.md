# Bug report: Battleship vs AI

This document covers how the game was tested, the bugs that testing found, and how each one was fixed. Every fix has an automated test so the bug can't come back unnoticed.

## How the game was tested

| Layer | What it checks | How to run it |
|---|---|---|
| Unit tests (14) | Ship placement rules (edges, overlaps, moving a ship), hit/miss/sunk results, rejecting repeat and out-of-bounds shots, turn order, win detection, and the AI's targeting behaviour | `npm test` |
| AI simulation | Plays 6,000 full games (2,000 per difficulty) against random fleets. Fails if the AI ever fires at the same square twice, fires off the board, or needs more than 100 shots | `npm run simulate` |
| Browser playthrough | Drives the real page in Chromium with Playwright: placing ships by mouse and keyboard, rotating, randomizing, double-clicking, clicking during the AI's turn, playing a full game, dismissing the end screen, restarting, and checking for console errors | `node tests/e2e.mjs` |
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

## Problems checked for and covered by tests

These are common bugs in turn-based browser games. The code guards against them, and the tests confirm each guard works:

- **Double-clicking fires two shots.** After each shot the enemy board locks until the AI has replied, and the game itself rejects a shot when it isn't the player's turn. Covered by "double-click fires once" and "no extra shot during AI turn".
- **Firing at the same square twice wastes a turn.** Repeat shots are ignored and the player keeps their turn. Covered by the unit test "repeat shot does not cost the turn".
- **The AI fires again after you restart.** If you click New game while the AI is "thinking", its pending move is cancelled, so it can't land on the fresh board. Covered by "play again resets boards and no stray AI shot".
- **The AI shoots a square twice or gets stuck.** Ruled out by 600 simulated games in the unit tests and 6,000 more in `npm run simulate`.
- **An empty board counts as "all ships sunk".** A board with no ships is not treated as defeated, so the game can't end before it starts. Covered by a unit test.
