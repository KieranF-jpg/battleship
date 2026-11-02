// Pirate campaign: five captains in a row, each one unlocked by beating the last.
export const CAMPAIGN_KEY = 'battleship.campaign.v1';

export const CAPTAINS = Object.freeze([
  {
    id: 'barnacle', name: 'Barnacle Bill', face: '🦀', difficulty: 'easy', powerups: false,
    blurb: 'Fires wherever the wind takes him. A gentle start.',
    lines: {
      start: ["Arr, a fresh challenger! Mind ye don't fall overboard.", "I've never lost a battle. Well, not this week."],
      hit: ['Ha! Even a crab finds a ship sometimes!', 'Did I do that? I did that!'],
      sink: ['Down she goes! I think I meant to do that.'],
      hurt: ['Oi! That was me lunch locker!', 'Ow! Me barnacles!'],
      sunk: ["Me ship! Me beautiful, barnacle-covered ship!"],
      win: ['I won? I WON! Somebody fetch me mum!'],
      lose: ['Fair winds, Captain. Calico Kate won\'t go so easy on ye.'],
    },
  },
  {
    id: 'calico', name: 'Calico Kate', face: '🦜', difficulty: 'medium', powerups: false,
    blurb: 'Hunts in a checkerboard and never lets a wounded ship escape.',
    lines: {
      start: ['Barnacle Bill was a warm-up. I am the storm.', 'Every other square, darling. That\'s all it takes.'],
      hit: ['Found ye. Now I finish the job.', 'Checkerboard never fails.'],
      sink: ['Another one for Davy Jones.', 'Told ye. Every other square.'],
      hurt: ['A lucky shot. Won\'t happen twice.', 'Hmph. Polly, write that down.'],
      sunk: ['That one was insured. Probably.'],
      win: ['Back to the tips, sweetheart. Ye need them.'],
      lose: ['Well fought. Watch out for Morgan, he cheats.'],
    },
  },
  {
    id: 'morgan', name: 'One-Eyed Morgan', face: '🏴‍☠️', difficulty: 'medium', powerups: true,
    blurb: 'Brings sonar, a broadside and a decoy barrel to every fight.',
    lines: {
      start: ['I may have one eye, but me sonar has two.', 'Power-ups, matey. All\'s fair at sea.'],
      hit: ['Me good eye never misses!', 'BOOM! Broadsides for breakfast!'],
      sink: ['Sunk! Ye should\'ve brought a decoy too.'],
      hurt: ['Arrgh, right in the blind spot!'],
      sunk: ['Me ship! I didn\'t see that coming. Literally.'],
      win: ['Nobody outfoxes One-Eyed Morgan!'],
      lose: ['Ye win this time. Blackbeard won\'t be so kind.'],
    },
  },
  {
    id: 'blackbeard', name: 'Blackbeard', face: '🧔', difficulty: 'hard', powerups: false,
    blurb: 'Works out the odds for every square, after every shot.',
    lines: {
      start: ['I set me beard on fire before battle. For atmosphere.', 'I have done the maths. Ye lose.'],
      hit: ['The odds never lie.', 'Exactly where I calculated.'],
      sink: ['Probability one. Certainty.', 'Another ship for me collection.'],
      hurt: ['A statistical anomaly.', 'Me beard is smouldering with rage!'],
      sunk: ['IMPOSSIBLE. Recalculating...'],
      win: ['The numbers always win.'],
      lose: ['Ye beat the odds. Now face the deep... Davy Jones awaits.'],
    },
  },
  {
    id: 'davy', name: 'Davy Jones', face: '🐙', difficulty: 'hard', powerups: true,
    blurb: 'The final boss. The Hard AI with every power-up and a kraken on call.',
    lines: {
      start: ['Do ye fear death? Ye should fear me sonar.', 'Welcome to me locker. Make yerself at home.'],
      hit: ['The sea claims what is hers.', 'Ye feel that? That\'s the kraken waking up.'],
      sink: ['One more soul for the locker!', 'Down, down, down to the deep!'],
      hurt: ['Ye dare strike the ruler of the deep?!'],
      sunk: ['Kraken! Why aren\'t ye helping?!'],
      win: ['Another captain for me crew. Forever.'],
      lose: ['Impossible... ye are the greatest captain on the seven seas!'],
    },
  },
]);

export const captainById = (id) => CAPTAINS.find((c) => c.id === id) || null;

export function emptyCampaign() {
  return { beaten: {} };
}

export function loadCampaign(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(CAMPAIGN_KEY) || 'null');
    if (!saved || typeof saved.beaten !== 'object' || !saved.beaten) return emptyCampaign();
    const beaten = {};
    for (const c of CAPTAINS) if (saved.beaten[c.id]) beaten[c.id] = saved.beaten[c.id];
    return { beaten };
  } catch {
    return emptyCampaign();
  }
}

export function saveCampaign(storage, progress) {
  try { storage?.setItem(CAMPAIGN_KEY, JSON.stringify(progress)); } catch { /* storage disabled */ }
}

export function isUnlocked(progress, index) {
  return index === 0 || Boolean(progress.beaten[CAPTAINS[index - 1]?.id]);
}

// Returns the new progress, whether this was the first win against the captain,
// the captain it unlocked (if any) and whether every captain is now beaten.
export function recordCampaign(progress, id, won, shots) {
  const beaten = { ...progress.beaten };
  const index = CAPTAINS.findIndex((c) => c.id === id);
  const prev = beaten[id];
  const firstWin = won && !prev;
  if (won) beaten[id] = { wins: (prev?.wins || 0) + 1, bestShots: Math.min(prev?.bestShots ?? Infinity, shots) };
  const next = firstWin ? CAPTAINS[index + 1] || null : null;
  return { progress: { beaten }, firstWin, next, complete: CAPTAINS.every((c) => beaten[c.id]) };
}

export function taunt(captain, event, rnd = Math.random) {
  const lines = captain.lines[event] || [];
  return lines.length ? lines[Math.floor(rnd() * lines.length)] : '';
}
