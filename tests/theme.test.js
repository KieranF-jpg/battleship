import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_KEY, loadTheme, saveTheme } from '../src/theme.js';
import { FLEET } from '../src/game.js';
import { shareText } from '../src/daily.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('every theme defines the same text keys with the same types', () => {
  for (const t of Object.values(THEMES)) {
    for (const [k, v] of Object.entries(THEMES.navy)) assert.equal(typeof t[k], typeof v, `${t.id}.${k}`);
  }
});

test('every theme names every ship in the fleet', () => {
  for (const t of Object.values(THEMES)) {
    for (const s of FLEET) assert.ok(t.ships[s.name], `${t.id} names ${s.name}`);
  }
  assert.equal(THEMES.pirate.ships.Battleship, 'Galleon');
});

test('theme choice round-trips through storage and falls back to navy', () => {
  const s = memory();
  assert.equal(loadTheme(s).id, 'navy');
  saveTheme(s, 'pirate');
  assert.equal(s.getItem(THEME_KEY), 'pirate');
  assert.equal(loadTheme(s).id, 'pirate');
  s.setItem(THEME_KEY, 'bogus');
  assert.equal(loadTheme(s).id, 'navy');
  assert.equal(loadTheme(null).id, 'navy');
  assert.equal(loadTheme({ getItem() { throw new Error('denied'); } }).id, 'navy');
});

test('share text uses the theme title', () => {
  const r = { date: '2026-01-01', won: true, shots: 1, hits: 1, sequence: ['sunk'] };
  assert.ok(shareText(r).startsWith('⚓ Battleship Daily #'));
  assert.ok(shareText(r, '', THEMES.pirate.shareTitle).startsWith('🏴‍☠️ Pirate Battleship Daily #'));
});
