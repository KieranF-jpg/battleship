// Tips & tricks: placement odds for the guide and a post-game tip based on how you played.
import { BOARD_SIZE, FLEET } from './game.js';

// How many ways the fleet's ships can be placed over each square of an empty board.
export function placementDensity(size = BOARD_SIZE, ships = FLEET) {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  for (const { size: len } of ships) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (c + len <= size) for (let i = 0; i < len; i++) grid[r][c + i]++;
        if (r + len <= size) for (let i = 0; i < len; i++) grid[r + i][c]++;
      }
    }
  }
  return grid;
}

// One tip for the result screen, picked from the player's last battle.
export function adviceFor({ won, shots, hits, difficulty, shipsLost }) {
  const accuracy = shots ? hits / shots : 0;
  if (shots >= 60 || (!won && accuracy < 0.25)) {
    return 'Hunt on a checkerboard. Every ship covers at least 2 squares, so firing at every other square finds them all in at most 50 shots.';
  }
  if (accuracy < 0.35) {
    return 'After a hit, fire at the four squares around it, then follow the line both ways until the ship sinks.';
  }
  if (won && shipsLost === 0 && difficulty !== 'hard') return 'Flawless! Ready for a tougher fight? Try the Hard AI.';
  if (!won) return 'Vary where you hide your fleet. The Hard AI plays the odds, so edges and corners are where it looks last.';
  return 'Open the tips to learn how the odds work, then watch the replay with the AI radar on.';
}
