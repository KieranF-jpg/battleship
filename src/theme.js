// Visual themes: the navy look (default) and a pirate reskin. Only text and styling change;
// internal ship names, saves, stats and daily fleets are the same in every theme.
export const THEME_KEY = 'battleship.theme';

const navy = {
  id: 'navy',
  docTitle: 'Battleship vs AI',
  title: 'Battleship',
  tagline: 'Sink the enemy fleet before the AI sinks yours.',
  setupTitle: '1. Deploy your fleet',
  startBtn: 'Start battle',
  playerTitle: 'Your fleet',
  enemyTitle: 'Enemy waters',
  logTitle: 'Battle log',
  ships: { Carrier: 'Carrier', Battleship: 'Battleship', Cruiser: 'Cruiser', Submarine: 'Submarine', Destroyer: 'Destroyer' },
  you: 'You',
  ai: 'AI',
  theirs: 'the enemy',
  yours: 'your',
  missWord: 'miss.',
  setup: 'Place your ships to begin.',
  started: 'Battle started! Fire on the enemy waters.',
  startLog: (difficulty) => `Battle started against the ${difficulty} AI.`,
  dailyLog: (n) => `Daily challenge #${n} started against the Hard AI.`,
  resumedLog: 'Resumed your unfinished battle.',
  resumed: 'Battle resumed. Your turn — fire on the enemy waters.',
  playerMiss: 'Miss.',
  playerHit: 'Hit!',
  playerSunk: (ship) => `You sank the enemy ${ship}!`,
  aiming: 'The AI is aiming…',
  aiMiss: 'The AI missed.',
  aiHit: 'The AI hit your ship!',
  aiSunk: (ship) => `The AI sank your ${ship}!`,
  yourTurn: 'Your turn — fire on the enemy waters.',
  victory: 'Victory! You sank the entire enemy fleet.',
  defeat: 'Defeat. The AI sank your fleet.',
  victoryTitle: 'Victory!',
  defeatTitle: 'Defeat',
  wonLog: 'You won the battle!',
  lostLog: 'The AI won the battle.',
  daily: (n) => `Daily challenge #${n}`,
  dailyDone: (n, won) => `Daily #${n}: ${won ? 'won' : 'lost'} · Share result`,
  shareTitle: '⚓ Battleship Daily',
  icon: '⚓',
  themeColor: '#0b1d33',
  confetti: ['#f5b83d', '#e2463b', '#3fb67a', '#eef4fa', '#5aa9ff'],
};

const pirate = {
  ...navy,
  id: 'pirate',
  docTitle: 'Pirate Battleship',
  title: 'Pirate Battleship',
  tagline: "Send the enemy fleet to Davy Jones' locker before they sink yours.",
  setupTitle: '1. Ready yer fleet',
  startBtn: 'Set sail!',
  playerTitle: 'Yer fleet',
  enemyTitle: 'Enemy waters',
  logTitle: "Captain's log",
  ships: { Carrier: "Man-o'-War", Battleship: 'Galleon', Cruiser: 'Frigate', Submarine: 'Brigantine', Destroyer: 'Sloop' },
  you: 'Ye',
  ai: 'The enemy',
  theirs: 'their',
  yours: 'yer',
  missWord: 'splash.',
  setup: 'Ready yer ships, Captain.',
  started: 'Cannons primed! Fire on the enemy waters.',
  startLog: (difficulty) => `Battle joined against the ${difficulty} pirate AI.`,
  dailyLog: (n) => `Daily plunder #${n}: battle joined against the Hard pirate AI.`,
  resumedLog: 'Back aboard yer unfinished battle.',
  resumed: 'Battle resumed. Yer turn — fire at will!',
  playerMiss: 'Splash! Ye missed.',
  playerHit: 'Direct hit!',
  playerSunk: (ship) => `Ye sent their ${ship} to Davy Jones!`,
  aiming: 'The enemy readies its cannons…',
  aiMiss: 'Their cannonball splashed into the sea.',
  aiHit: 'They holed one of yer ships!',
  aiSunk: (ship) => `They sank yer ${ship}!`,
  yourTurn: 'Yer turn — fire at will!',
  victory: 'Victory! The seas be yours, Captain.',
  defeat: 'Defeat. Yer fleet rests with Davy Jones.',
  victoryTitle: '⚔️ Victory!',
  defeatTitle: '☠️ Defeat',
  wonLog: 'Ye won the battle!',
  lostLog: 'The enemy won the battle.',
  daily: (n) => `Daily plunder #${n}`,
  dailyDone: (n, won) => `Plunder #${n}: ${won ? 'won' : 'lost'} · Share result`,
  shareTitle: '🏴‍☠️ Pirate Battleship Daily',
  icon: '☠️',
  themeColor: '#1e140a',
  confetti: ['#f7d354', '#e8b730', '#c99a1e', '#fff1a8'],
};

export const THEMES = { navy, pirate };

export function loadTheme(storage) {
  try {
    return THEMES[storage?.getItem(THEME_KEY)] || navy;
  } catch {
    return navy;
  }
}

export function saveTheme(storage, id) {
  try { storage?.setItem(THEME_KEY, id); } catch { /* storage disabled */ }
}
