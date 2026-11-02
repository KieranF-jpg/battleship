// Lifetime stats, achievements and daily challenge results, persisted in localStorage.
import { previousDay } from './daily.js';

export const STATS_KEY = 'battleship.stats.v1';

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-win', name: 'First Victory', desc: 'Win a battle.' },
  { id: 'admiral', name: 'Admiral', desc: 'Beat the Hard AI.' },
  { id: 'blitz', name: 'Blitz', desc: 'Win in 45 shots or fewer.' },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Win with 50% accuracy or better.' },
  { id: 'untouchable', name: 'Untouchable', desc: 'Win without losing a ship.' },
  { id: 'last-stand', name: 'Last Stand', desc: 'Win with only one ship left afloat.' },
  { id: 'hat-trick', name: 'Hat Trick', desc: 'Win 3 battles in a row.' },
  { id: 'unstoppable', name: 'Unstoppable', desc: 'Win 5 battles in a row.' },
  { id: 'veteran', name: 'Veteran', desc: 'Finish 10 battles.' },
  { id: 'daily-duty', name: 'Daily Duty', desc: 'Win a daily challenge.' },
  { id: 'regular', name: 'Regular', desc: 'Win the daily challenge 3 days in a row.' },
]);

const DIFFICULTY_KEYS = ['easy', 'medium', 'hard'];

export function emptyStats() {
  return {
    played: 0,
    wins: 0,
    streak: 0,
    bestStreak: 0,
    fewestShotsWin: null,
    bestAccuracy: null,
    totalShots: 0,
    totalHits: 0,
    byDifficulty: Object.fromEntries(DIFFICULTY_KEYS.map((d) => [d, { played: 0, wins: 0 }])),
    achievements: {},
    daily: { results: {}, streak: 0, bestStreak: 0, lastWin: null },
  };
}

export function loadStats(storage) {
  try {
    const raw = storage?.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const saved = JSON.parse(raw);
    const base = emptyStats();
    return {
      ...base,
      ...saved,
      byDifficulty: { ...base.byDifficulty, ...saved.byDifficulty },
      daily: { ...base.daily, ...saved.daily },
      achievements: { ...saved.achievements },
    };
  } catch {
    return emptyStats();
  }
}

export function saveStats(storage, stats) {
  try {
    storage?.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage can be full or disabled (private mode); stats are a nice-to-have.
  }
}

export const winRate = (s) => (s.played ? Math.round((s.wins / s.played) * 100) : 0);

// summary: { won, difficulty, shots, hits, shipsLost, mode, date, sequence }
// Returns a new stats object, the ids of newly unlocked achievements and which records were broken.
export function recordGame(prev, summary, now = new Date()) {
  const s = JSON.parse(JSON.stringify(prev));
  const { won, difficulty, shots, hits, shipsLost, mode, date } = summary;
  const accuracy = shots ? hits / shots : 0;
  const records = [];

  s.played++;
  s.totalShots += shots;
  s.totalHits += hits;
  const diff = s.byDifficulty[difficulty] || (s.byDifficulty[difficulty] = { played: 0, wins: 0 });
  diff.played++;
  if (won) {
    s.wins++;
    diff.wins++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (s.fewestShotsWin === null || shots < s.fewestShotsWin) {
      if (s.fewestShotsWin !== null) records.push('fewestShotsWin');
      s.fewestShotsWin = shots;
    }
    if (s.bestAccuracy === null || accuracy > s.bestAccuracy) {
      if (s.bestAccuracy !== null) records.push('bestAccuracy');
      s.bestAccuracy = accuracy;
    }
  } else {
    s.streak = 0;
  }

  if (mode === 'daily' && date && !s.daily.results[date]) {
    s.daily.results[date] = { won, shots, hits, sequence: summary.sequence || [] };
    if (won) {
      s.daily.streak = s.daily.lastWin === previousDay(date) ? s.daily.streak + 1 : 1;
      s.daily.bestStreak = Math.max(s.daily.bestStreak, s.daily.streak);
      s.daily.lastWin = date;
    } else {
      s.daily.streak = 0;
    }
  }

  const earned = {
    'first-win': won,
    admiral: won && difficulty === 'hard',
    blitz: won && shots <= 45,
    sharpshooter: won && accuracy >= 0.5,
    untouchable: won && shipsLost === 0,
    'last-stand': won && shipsLost === 4,
    'hat-trick': s.streak >= 3,
    unstoppable: s.streak >= 5,
    veteran: s.played >= 10,
    'daily-duty': won && mode === 'daily',
    regular: s.daily.streak >= 3,
  };
  const unlocked = [];
  for (const { id } of ACHIEVEMENTS) {
    if (earned[id] && !s.achievements[id]) {
      s.achievements[id] = now.toISOString();
      unlocked.push(id);
    }
  }
  return { stats: s, unlocked, records };
}
