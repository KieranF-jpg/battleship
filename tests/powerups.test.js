import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLEET, HORIZONTAL, VERTICAL } from '../src/game.js';
import { AI } from '../src/ai.js';
import { createMatch, replay, toRecord } from '../src/match.js';
import { mulberry32 } from '../src/rng.js';
import { CAPTAINS, emptyCampaign, isUnlocked, loadCampaign, recordCampaign, saveCampaign, taunt, CAMPAIGN_KEY } from '../src/campaign.js';
import { emptyStats, recordGame } from '../src/stats.js';

const fleet = [['Carrier', 0, 0, 'H'], ['Battleship', 2, 0, 'H'], ['Cruiser', 4, 0, 'H'], ['Submarine', 6, 0, 'H'], ['Destroyer', 8, 0, 'H']];
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

function powerGame(seed = 7) {
  return createMatch({ seed, difficulty: 'hard', fleet, powerups: true });
}

test('power-ups hide a decoy on open water on both boards', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = powerGame(seed);
    for (const board of [g.player, g.enemy]) {
      assert.ok(board.decoy);
      assert.equal(board.shipAt(...board.decoy), null);
    }
  }
  assert.equal(createMatch({ seed: 1, difficulty: 'hard', fleet }).enemy.decoy, null);
});

test('shooting a decoy wastes the shot and is not a hit', () => {
  const g = powerGame();
  const [r, c] = g.enemy.decoy;
  const o = g.playerFire(r, c);
  assert.equal(o.result, 'decoy');
  assert.equal(g.stats.player.shots, 1);
  assert.equal(g.stats.player.hits, 0);
  assert.equal(g.turn, 'ai');
});

test('sonar counts unhit ship squares and the decoy, once per game', () => {
  const g = powerGame();
  g.enemy.ships = [];
  g.enemy.placeShip(FLEET[4], 5, 5, HORIZONTAL);
  g.enemy.decoy = [4, 4];
  const o = g.playerSonar(5, 5);
  assert.deepEqual([o.result, o.count], ['sonar', 3]);
  assert.equal(g.stats.player.shots, 0);
  assert.equal(g.charges.player.sonar, 0);
  g.turn = 'player';
  assert.equal(g.playerSonar(1, 1), null);
  assert.equal(g.enemy.sonar(0, 9), 0);
});

test('broadside fires up to 3 shots in a line, skipping squares already shot', () => {
  const g = powerGame();
  g.enemy.ships = [];
  g.enemy.decoy = null;
  g.enemy.placeShip(FLEET[2], 3, 3, VERTICAL);
  g.enemy.placeShip(FLEET[0], 9, 0, HORIZONTAL);
  g.playerFire(4, 3);
  g.aiFire();
  const o = g.playerBroadside(2, 3, VERTICAL);
  assert.equal(o.result, 'broadside');
  assert.deepEqual(o.outcomes.map((x) => [x.row, x.result]), [[2, 'miss'], [3, 'hit']]);
  assert.equal(g.charges.player.broadside, 0);
  assert.equal(g.turn, 'ai');
  g.aiFire();
  assert.equal(g.playerBroadside(0, 0, HORIZONTAL), null);
  assert.equal(g.playerFire(5, 3).result, 'sunk');
});

test('the AI uses its power-ups and every power-up game finishes', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = createMatch({ seed, difficulty: seed % 2 ? 'hard' : 'medium', fleet, powerups: true });
    const rng = mulberry32(seed);
    let guard = 0;
    while (g.phase === 'playing' && guard++ < 400) {
      if (g.turn === 'player') {
        const open = [];
        for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!g.enemy.isShot(r, c)) open.push([r, c]);
        const [r, c] = open[Math.floor(rng() * open.length)];
        if (g.charges.player.sonar && rng() < 0.1) g.playerSonar(r, c);
        else if (g.charges.player.broadside && rng() < 0.1) g.playerBroadside(r, c, rng() < 0.5 ? HORIZONTAL : VERTICAL);
        else g.playerFire(r, c);
      } else {
        g.aiFire();
      }
    }
    assert.equal(g.phase, 'over', `seed ${seed} finished`);
    if (g.winner === 'ai') assert.equal(g.charges.ai.broadside, 0, `seed ${seed}: AI used its broadside`);
    const record = toRecord(g, { seed, difficulty: g.ai.difficulty, fleet });
    const again = replay(record);
    assert.deepEqual(again.moves, g.moves, `seed ${seed} replays identically`);
    for (const n of [1, 7, Math.floor(g.moves.length / 2), g.moves.length - 1]) {
      assert.equal(replay(record, n).moves.length, n, `seed ${seed} stops at move ${n}`);
    }
  }
});

test('random fill keeps the ships already placed', () => {
  const g = new Game({ ai: new AI({ difficulty: 'easy' }) });
  g.player.placeShip(FLEET[0], 0, 0, HORIZONTAL);
  g.player.placeMissingRandomly(FLEET, mulberry32(5));
  assert.equal(g.player.ships.length, FLEET.length);
  assert.deepEqual(g.player.ships.find((s) => s.name === 'Carrier').cells.slice(0, 2), [[0, 0], [0, 1]]);
  assert.ok(g.allPlayerShipsPlaced());
});

test('an empty AI sonar ping rules out the whole area', () => {
  const ai = new AI({ difficulty: 'hard', rng: mulberry32(1) });
  ai.recordSonar(5, 5, 0);
  for (let i = 0; i < 60; i++) {
    const [r, c] = ai.chooseShot();
    assert.ok(Math.abs(r - 5) > 1 || Math.abs(c - 5) > 1);
    ai.recordResult({ row: r, col: c, result: 'miss' });
  }
});

test('records without power-up fields still replay', () => {
  const g = createMatch({ seed: 3, difficulty: 'easy', fleet });
  g.playerFire(9, 9);
  g.aiFire();
  const record = toRecord(g, { seed: 3, difficulty: 'easy', fleet });
  delete record.powerups;
  delete record.captain;
  assert.equal(replay(record).moves.length, 2);
});

test('campaign captains unlock in order and progress persists', () => {
  let p = emptyCampaign();
  assert.ok(isUnlocked(p, 0));
  assert.ok(!isUnlocked(p, 1));
  let r = recordCampaign(p, 'barnacle', false, 60);
  assert.ok(!r.firstWin && !isUnlocked(r.progress, 1));
  r = recordCampaign(p, 'barnacle', true, 60);
  assert.equal(r.next.id, 'calico');
  assert.ok(isUnlocked(r.progress, 1) && !isUnlocked(r.progress, 2));
  r = recordCampaign(r.progress, 'barnacle', true, 50);
  assert.deepEqual(r.progress.beaten.barnacle, { wins: 2, bestShots: 50 });
  assert.equal(r.next, null);
  p = r.progress;
  for (const c of CAPTAINS.slice(1)) ({ progress: p, ...r } = recordCampaign(p, c.id, true, 70));
  assert.ok(r.complete && r.next === null);
  const store = memory();
  saveCampaign(store, p);
  assert.deepEqual(loadCampaign(store), p);
  store.setItem(CAMPAIGN_KEY, '{"beaten":{"__proto__":{"x":1},"nobody":{}}}');
  assert.deepEqual(loadCampaign(store), emptyCampaign());
  store.setItem(CAMPAIGN_KEY, 'not json');
  assert.deepEqual(loadCampaign(store), emptyCampaign());
});

test('every captain has a line for every event and a valid difficulty', () => {
  for (const c of CAPTAINS) {
    assert.ok(['easy', 'medium', 'hard'].includes(c.difficulty));
    for (const e of ['start', 'hit', 'sink', 'hurt', 'sunk', 'win', 'lose']) assert.ok(taunt(c, e).length > 0, `${c.id} ${e}`);
  }
  assert.equal(CAPTAINS[CAPTAINS.length - 1].powerups, true);
});

test('power-up and campaign achievements', () => {
  const base = { won: true, difficulty: 'easy', shots: 80, hits: 17, shipsLost: 1, mode: 'classic', date: null };
  assert.ok(recordGame(emptyStats(), { ...base, powerups: true }).unlocked.includes('power-play'));
  assert.ok(!recordGame(emptyStats(), base).unlocked.includes('power-play'));
  assert.ok(recordGame(emptyStats(), { ...base, mode: 'campaign', campaignComplete: true }).unlocked.includes('scourge'));
});
