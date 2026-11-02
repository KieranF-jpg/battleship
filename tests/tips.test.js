import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceFor, placementDensity } from '../src/tips.js';
import { FLEET } from '../src/game.js';

test('placement density favours the centre and is symmetric', () => {
  const d = placementDensity();
  assert.equal(d[0][0], FLEET.length * 2);
  assert.ok(d[4][4] > d[0][4] && d[0][4] > d[0][0]);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    assert.equal(d[r][c], d[c][r]);
    assert.equal(d[r][c], d[9 - r][9 - c]);
  }
  const total = FLEET.reduce((sum, s) => sum + 2 * s.size * 10 * (11 - s.size), 0);
  assert.equal(d.flat().reduce((a, b) => a + b, 0), total);
});

test('advice matches how the battle went', () => {
  const base = { won: true, shots: 45, hits: 17, difficulty: 'hard', shipsLost: 2 };
  assert.match(adviceFor({ ...base, shots: 80 }), /checkerboard/);
  assert.match(adviceFor({ ...base, won: false, shots: 40, hits: 8 }), /checkerboard/);
  assert.match(adviceFor({ ...base, shots: 55, hits: 17 }), /four squares/);
  assert.match(adviceFor({ ...base, difficulty: 'easy', shipsLost: 0 }), /Hard AI/);
  assert.match(adviceFor({ ...base, won: false, shots: 40, hits: 16 }), /hide your fleet/i);
  assert.equal(typeof adviceFor({ won: false, shots: 0, hits: 0, difficulty: 'easy', shipsLost: 5 }), 'string');
});
