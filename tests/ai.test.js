import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, FLEET, HORIZONTAL, VERTICAL, key } from '../src/game.js';
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

function playOut(difficulty, seed) {
  const rng = seeded(seed);
  const board = new Board();
  board.placeFleetRandomly(FLEET, rng);
  const ai = new AI({ difficulty, rng });
  const seen = new Set();
  let shots = 0;
  while (!board.allSunk()) {
    const [r, c] = ai.chooseShot();
    assert.ok(board.inBounds(r, c), `in bounds ${r},${c}`);
    assert.ok(!seen.has(key(r, c)), `${difficulty} AI repeated ${r},${c}`);
    seen.add(key(r, c));
    ai.recordResult(board.receiveShot(r, c));
    shots++;
    assert.ok(shots <= 100);
  }
  return shots;
}

for (const difficulty of ['easy', 'medium', 'hard']) {
  test(`${difficulty} AI never repeats a shot and always finishes`, () => {
    for (let seed = 0; seed < 200; seed++) playOut(difficulty, seed);
  });
}

test('harder AIs need fewer shots on average', () => {
  const avg = (d) => {
    let total = 0;
    for (let seed = 0; seed < 150; seed++) total += playOut(d, 1000 + seed);
    return total / 150;
  };
  const easy = avg('easy'), medium = avg('medium'), hard = avg('hard');
  assert.ok(medium < easy, `medium ${medium} < easy ${easy}`);
  assert.ok(hard < medium, `hard ${hard} < medium ${medium}`);
});

test('medium and hard AI finish off a ship after a hit', () => {
  for (const difficulty of ['medium', 'hard']) {
    const ai = new AI({ difficulty, rng: seeded(7) });
    ai.recordResult({ row: 5, col: 5, result: 'hit' });
    const [r, c] = ai.chooseShot();
    assert.equal(Math.abs(r - 5) + Math.abs(c - 5), 1, `${difficulty} should shoot next to the hit`);
  }
});

test('medium AI continues along a line of hits', () => {
  const ai = new AI({ difficulty: 'medium', rng: seeded(8) });
  ai.recordResult({ row: 4, col: 4, result: 'hit' });
  ai.recordResult({ row: 4, col: 5, result: 'hit' });
  for (let i = 0; i < 20; i++) {
    const [r, c] = ai.chooseShot();
    assert.ok(r === 4 && (c === 3 || c === 6));
  }
});

test('unknown difficulty is rejected', () => {
  assert.throws(() => new AI({ difficulty: 'impossible' }));
});
