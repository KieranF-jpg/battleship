import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, FLEET } from '../src/game.js';
import { createMatch, fleetOf, replay, toRecord } from '../src/match.js';
import { mulberry32, hashString } from '../src/rng.js';
import { dailyNumber, dailySeed, previousDay, shareText, todayKey } from '../src/daily.js';
import { ACHIEVEMENTS, emptyStats, loadStats, recordGame, saveStats, STATS_KEY } from '../src/stats.js';
import { AI } from '../src/ai.js';

function randomFleet(seed) {
  const b = new Board();
  b.placeFleetRandomly(FLEET, mulberry32(seed));
  return fleetOf(b);
}

function playOut(game, rng) {
  while (game.phase === 'playing') {
    const open = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!game.enemy.isShot(r, c)) open.push([r, c]);
    const [r, c] = open[Math.floor(rng() * open.length)];
    game.playerFire(r, c);
    if (game.phase === 'playing') game.aiFire();
  }
}

test('same seed gives the same enemy fleet and the same AI shots', () => {
  const fleet = randomFleet(1);
  const a = createMatch({ seed: 42, difficulty: 'hard', fleet });
  const b = createMatch({ seed: 42, difficulty: 'hard', fleet });
  assert.deepEqual(fleetOf(a.enemy), fleetOf(b.enemy));
  playOut(a, mulberry32(7));
  playOut(b, mulberry32(7));
  assert.deepEqual(a.moves, b.moves);
  const c = createMatch({ seed: 43, difficulty: 'hard', fleet });
  assert.notDeepEqual(fleetOf(a.enemy), fleetOf(c.enemy));
});

test('a saved record replays to the identical game, and can stop at any move', () => {
  const meta = { seed: 99, difficulty: 'medium', mode: 'classic', date: null, fleet: randomFleet(2) };
  const game = createMatch(meta);
  playOut(game, mulberry32(3));
  const record = JSON.parse(JSON.stringify(toRecord(game, meta)));
  const full = replay(record);
  assert.deepEqual(full.moves, game.moves);
  assert.equal(full.winner, game.winner);
  const partial = replay(record, 5);
  assert.equal(partial.moves.length, 5);
  assert.deepEqual(partial.moves, game.moves.slice(0, 5));
  assert.equal(replay(record, 0).moves.length, 0);
});

test('replaying an unfinished game resumes on the player\'s turn', () => {
  const meta = { seed: 5, difficulty: 'hard', mode: 'classic', date: null, fleet: randomFleet(4) };
  const game = createMatch(meta);
  game.playerFire(0, 0);
  game.aiFire();
  game.playerFire(9, 9);
  const resumed = replay(toRecord(game, meta));
  assert.equal(resumed.phase, 'playing');
  assert.equal(resumed.turn, 'player');
  assert.equal(resumed.moves.length, 4);
});

test('replay rejects invalid records', () => {
  assert.throws(() => replay(null));
  assert.throws(() => replay({ v: 999 }));
  const meta = { seed: 1, difficulty: 'easy', mode: 'classic', date: null, fleet: randomFleet(1) };
  assert.throws(() => replay({ ...toRecord(createMatch(meta), meta), shots: [[0, 0], [0, 0]] }));
});

test('AI heatmap is scaled 0..1 and skips squares already shot', () => {
  const ai = new AI({ difficulty: 'easy' });
  const heat = ai.heatmap();
  assert.equal(Math.max(...heat.values()), 1);
  assert.ok(heat.get('4,4') > heat.get('0,0'), 'centre squares are likelier than corners');
  ai.recordResult({ row: 4, col: 4, result: 'miss' });
  assert.equal(ai.heatmap().has('4,4'), false);
});

test('daily challenge seed and numbering are stable per UTC day', () => {
  assert.equal(todayKey(new Date('2026-11-02T23:30:00Z')), '2026-11-02');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(dailyNumber('2026-01-01'), 1);
  assert.equal(dailyNumber('2026-11-02'), 306);
  assert.equal(dailySeed('2026-11-02'), dailySeed('2026-11-02'));
  assert.notEqual(dailySeed('2026-11-02'), dailySeed('2026-11-03'));
  assert.equal(typeof hashString('x'), 'number');
});

test('share text shows the shot sequence without revealing positions', () => {
  const text = shareText({ date: '2026-11-02', won: true, shots: 12, hits: 6, sequence: ['miss', 'hit', 'sunk', ...Array(9).fill('miss')] }, 'https://example.com/');
  const lines = text.split('\n');
  assert.equal(lines[0], '⚓ Battleship Daily #306');
  assert.equal(lines[1], 'Victory in 12 shots · 50% accuracy');
  assert.equal(lines[3], '🌊🟥💥🌊🌊🌊🌊🌊🌊🌊');
  assert.equal(lines[4], '🌊🌊');
  assert.equal(lines.at(-1), 'https://example.com/');
});

const win = (over = {}) => ({ won: true, difficulty: 'easy', mode: 'classic', date: null, shots: 60, hits: 17, shipsLost: 2, sequence: [], ...over });

test('stats track wins, streaks and records', () => {
  let s = emptyStats();
  let r = recordGame(s, win({ shots: 70 }));
  s = r.stats;
  assert.deepEqual(r.records, []);
  r = recordGame(s, win({ shots: 50 }));
  s = r.stats;
  assert.deepEqual(r.records, ['fewestShotsWin', 'bestAccuracy']);
  assert.equal(s.streak, 2);
  s = recordGame(s, win({ won: false, hits: 10 })).stats;
  assert.equal(s.streak, 0);
  assert.equal(s.bestStreak, 2);
  assert.equal(s.played, 3);
  assert.equal(s.wins, 2);
  assert.equal(s.fewestShotsWin, 50);
  assert.deepEqual(s.byDifficulty.easy, { played: 3, wins: 2 });
});

test('achievements unlock once, when earned', () => {
  let r = recordGame(emptyStats(), win({ difficulty: 'hard', shots: 34, shipsLost: 0 }));
  assert.deepEqual(r.unlocked.sort(), ['admiral', 'blitz', 'first-win', 'sharpshooter', 'untouchable']);
  r = recordGame(r.stats, win({ difficulty: 'hard', shots: 34, shipsLost: 4 }));
  assert.deepEqual(r.unlocked, ['last-stand']);
  r = recordGame(r.stats, win());
  assert.deepEqual(r.unlocked, ['hat-trick']);
  assert.equal(Object.keys(r.stats.achievements).length, 7);
  assert.ok(ACHIEVEMENTS.every((a) => a.name && a.desc));
});

test('daily results count once per day and build a streak on consecutive days', () => {
  let s = emptyStats();
  const daily = (date, won = true) => win({ mode: 'daily', date, difficulty: 'hard', won });
  s = recordGame(s, daily('2026-11-01')).stats;
  s = recordGame(s, daily('2026-11-02')).stats;
  assert.equal(s.daily.streak, 2);
  s = recordGame(s, daily('2026-11-02', false)).stats;
  assert.equal(s.daily.results['2026-11-02'].won, true, 'second attempt on the same day is ignored');
  const r = recordGame(s, daily('2026-11-03'));
  assert.equal(r.stats.daily.streak, 3);
  assert.ok(r.unlocked.includes('regular'));
  s = recordGame(r.stats, daily('2026-11-05')).stats;
  assert.equal(s.daily.streak, 1, 'missing a day resets the streak');
  assert.equal(s.daily.bestStreak, 3);
});

test('stats survive a save/load round trip and bad storage', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = recordGame(emptyStats(), win()).stats;
  saveStats(storage, s);
  assert.deepEqual(loadStats(storage), s);
  store.set(STATS_KEY, '{not json');
  assert.deepEqual(loadStats(storage), emptyStats());
  assert.deepEqual(loadStats(null), emptyStats());
  assert.doesNotThrow(() => saveStats({ setItem() { throw new Error('full'); } }, s));
});
