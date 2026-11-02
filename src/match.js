// A match is fully described by its seed, difficulty, the player's fleet and the player's shots.
// The enemy fleet and every AI shot are derived from the seed, so a saved record can be
// resumed after a reload or replayed shot by shot.
import { FLEET, Game } from './game.js';
import { AI } from './ai.js';
import { mulberry32 } from './rng.js';

export const RECORD_VERSION = 1;

const aiSeed = (seed) => (seed ^ 0x9e3779b9) >>> 0;

export function fleetOf(board) {
  return board.ships.map((s) => [s.name, s.cells[0][0], s.cells[0][1], s.orientation]);
}

export function createMatch({ seed, difficulty, fleet }) {
  const game = new Game({ rng: mulberry32(seed), ai: new AI({ difficulty, rng: mulberry32(aiSeed(seed)) }) });
  for (const [name, row, col, orientation] of fleet) {
    const spec = FLEET.find((s) => s.name === name);
    if (!spec) throw new Error(`Unknown ship: ${name}`);
    game.player.placeShip(spec, row, col, orientation);
  }
  game.start();
  return game;
}

export function toRecord(game, { seed, difficulty, mode = 'classic', date = null, fleet }) {
  return {
    v: RECORD_VERSION,
    seed,
    difficulty,
    mode,
    date,
    fleet,
    shots: game.moves.filter((m) => m.who === 'player').map((m) => [m.row, m.col]),
  };
}

// Rebuilds a match from a record, applying at most `maxMoves` shots (player and AI combined).
export function replay(record, maxMoves = Infinity) {
  if (!record || record.v !== RECORD_VERSION) throw new Error('Unsupported record');
  const game = createMatch(record);
  for (const [row, col] of record.shots) {
    if (game.moves.length >= maxMoves || game.phase !== 'playing') break;
    if (!game.playerFire(row, col)) throw new Error(`Invalid shot in record: ${row},${col}`);
    if (game.moves.length >= maxMoves) break;
    if (game.phase === 'playing') game.aiFire();
  }
  return game;
}
