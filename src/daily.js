// Daily challenge: everyone gets the same enemy fleet and AI for the day (UTC).
import { hashString } from './rng.js';

export const DAILY_DIFFICULTY = 'hard';
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86400000;

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function previousDay(dateKey) {
  return todayKey(new Date(Date.parse(`${dateKey}T00:00:00Z`) - DAY_MS));
}

export function dailyNumber(dateKey) {
  return Math.floor((Date.parse(`${dateKey}T00:00:00Z`) - EPOCH) / DAY_MS) + 1;
}

export function dailySeed(dateKey) {
  return hashString(`battleship-daily:${dateKey}`);
}

const EMOJI = { miss: '🌊', hit: '🟥', sunk: '💥' };

// Shot-by-shot emoji grid: shows how the game went without giving away ship positions.
export function shareText({ date, won, shots, hits, sequence }, url = '', title = '⚓ Battleship Daily') {
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  const rows = [];
  for (let i = 0; i < sequence.length; i += 10) {
    rows.push(sequence.slice(i, i + 10).map((r) => EMOJI[r] || '⬜').join(''));
  }
  const n = `${shots} shot${shots === 1 ? '' : 's'}`;
  const headline = won ? `Victory in ${n} · ${accuracy}% accuracy` : `Defeated after ${n} · ${accuracy}% accuracy`;
  const lines = [`${title} #${dailyNumber(date)}`, headline, '', ...rows];
  if (url) lines.push('', url);
  return lines.join('\n');
}
