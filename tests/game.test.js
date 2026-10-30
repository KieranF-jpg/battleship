import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, Game, FLEET, HORIZONTAL, VERTICAL, isSunk } from '../src/game.js';
import { AI } from '../src/ai.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('ships cannot go off the board or overlap', () => {
  const b = new Board();
  assert.equal(b.canPlace(0, 6, 5, HORIZONTAL), false);
  assert.equal(b.canPlace(0, 5, 5, HORIZONTAL), true);
  assert.equal(b.canPlace(6, 0, 5, VERTICAL), false);
  b.placeShip(FLEET[0], 0, 0, HORIZONTAL);
  assert.equal(b.canPlace(0, 4, 2, VERTICAL), false);
  assert.equal(b.canPlace(1, 0, 2, HORIZONTAL), true);
  assert.throws(() => b.placeShip(FLEET[0], 5, 5, HORIZONTAL));
});

test('canPlace can ignore the ship being moved', () => {
  const b = new Board();
  b.placeShip(FLEET[4], 0, 0, HORIZONTAL);
  assert.equal(b.canPlace(0, 1, 2, HORIZONTAL), false);
  assert.equal(b.canPlace(0, 1, 2, HORIZONTAL, 'Destroyer'), true);
});

test('shots report miss, hit and sunk, and repeat shots are rejected', () => {
  const b = new Board();
  b.placeShip(FLEET[4], 2, 2, VERTICAL);
  assert.equal(b.receiveShot(0, 0).result, 'miss');
  assert.equal(b.receiveShot(2, 2).result, 'hit');
  assert.throws(() => b.receiveShot(2, 2));
  assert.throws(() => b.receiveShot(10, 0));
  const sunk = b.receiveShot(3, 2);
  assert.equal(sunk.result, 'sunk');
  assert.equal(sunk.ship.name, 'Destroyer');
  assert.deepEqual(sunk.ship.cells, [[2, 2], [3, 2]]);
  assert.equal(b.allSunk(), true);
});

test('empty board is not "all sunk"', () => {
  assert.equal(new Board().allSunk(), false);
});

test('random fleet placement is always valid', () => {
  const rng = seeded(1);
  for (let i = 0; i < 500; i++) {
    const b = new Board();
    b.placeFleetRandomly(FLEET, rng);
    assert.equal(b.ships.length, FLEET.length);
    const cells = new Set();
    for (const s of b.ships) {
      for (const [r, c] of s.cells) {
        assert.ok(b.inBounds(r, c));
        cells.add(`${r},${c}`);
      }
    }
    assert.equal(cells.size, FLEET.reduce((n, s) => n + s.size, 0));
  }
});

test('game enforces turns and ignores repeat or out-of-turn shots', () => {
  const rng = seeded(2);
  const game = new Game({ ai: new AI({ rng }), rng });
  assert.throws(() => game.start());
  game.player.placeFleetRandomly(FLEET, rng);
  game.start();
  assert.equal(game.aiFire(), null, 'AI cannot fire on the player turn');
  assert.ok(game.playerFire(0, 0));
  assert.equal(game.playerFire(0, 1), null, 'player cannot fire twice in a row');
  assert.ok(game.aiFire());
  assert.equal(game.playerFire(0, 0), null, 'repeat shot is ignored');
  assert.equal(game.turn, 'player', 'repeat shot does not cost the turn');
});

test('player wins by sinking every enemy ship', () => {
  const rng = seeded(3);
  const game = new Game({ ai: new AI({ difficulty: 'easy', rng }), rng });
  game.player.placeFleetRandomly(FLEET, rng);
  game.start();
  const targets = game.enemy.ships.flatMap((s) => s.cells);
  for (const [r, c] of targets) {
    assert.ok(game.playerFire(r, c));
    if (game.phase === 'playing') game.aiFire();
  }
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 'player');
  assert.ok(game.enemy.ships.every(isSunk));
  assert.equal(game.playerFire(9, 9), null);
});
