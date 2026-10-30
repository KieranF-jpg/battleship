// Plays thousands of AI-vs-random-fleet games to sanity-check the AI and report its strength.
import { Board, FLEET, key } from '../src/game.js';
import { AI } from '../src/ai.js';

const games = Number(process.argv[2] || 2000);

for (const difficulty of ['easy', 'medium', 'hard']) {
  const results = [];
  for (let g = 0; g < games; g++) {
    const board = new Board();
    board.placeFleetRandomly(FLEET);
    const ai = new AI({ difficulty });
    const seen = new Set();
    let shots = 0;
    while (!board.allSunk()) {
      const [r, c] = ai.chooseShot();
      if (seen.has(key(r, c))) throw new Error(`${difficulty}: repeated shot at ${r},${c}`);
      seen.add(key(r, c));
      ai.recordResult(board.receiveShot(r, c));
      if (++shots > 100) throw new Error(`${difficulty}: exceeded 100 shots`);
    }
    results.push(shots);
  }
  results.sort((a, b) => a - b);
  const avg = results.reduce((a, b) => a + b, 0) / games;
  console.log(`${difficulty.padEnd(6)} avg ${avg.toFixed(1)} shots | best ${results[0]} | median ${results[games >> 1]} | worst ${results[games - 1]}`);
}
