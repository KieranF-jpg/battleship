import { BOARD_SIZE, BROADSIDE_LENGTH, FLEET, HORIZONTAL, VERTICAL, Game, key, shipCells, isSunk } from './game.js';
import { createMatch, fleetOf, replay, toRecord } from './match.js';
import { randomSeed } from './rng.js';
import { DAILY_DIFFICULTY, dailyNumber, dailySeed, shareText, todayKey } from './daily.js';
import { ACHIEVEMENTS, emptyStats, loadStats, recordGame, saveStats, winRate } from './stats.js';
import * as sound from './sound.js';
import { THEMES, loadTheme, saveTheme } from './theme.js';
import * as pirate from './pirate.js';
import { adviceFor, placementDensity } from './tips.js';
import { CAPTAINS, captainById, isUnlocked, loadCampaign, recordCampaign, saveCampaign, taunt } from './campaign.js';

const AI_DELAY_MS = 650;
const END_DELAY_MS = 900;
const PIRATE_END_DELAY_MS = 3200;
const REPLAY_STEP_MS = 400;
const SAVE_KEY = 'battleship.current.v1';
const COLS = 'ABCDEFGHIJ';
const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const storage = (() => {
  try {
    const s = window.localStorage;
    s.getItem(SAVE_KEY);
    return s;
  } catch {
    return null;
  }
})();

const els = {
  setup: $('setup'),
  picker: $('ship-picker'),
  rotate: $('rotate-btn'),
  orientationLabel: $('orientation-label'),
  random: $('random-btn'),
  clear: $('clear-btn'),
  difficulty: $('difficulty'),
  mode: $('mode'),
  campaignBtn: $('campaign-btn'),
  campaignDialog: $('campaign-dialog'),
  campaignList: $('campaign-list'),
  campaignClose: $('campaign-close-btn'),
  captain: $('captain'),
  captainFace: $('captain-face'),
  captainName: $('captain-name'),
  captainLine: $('captain-line'),
  powerups: $('powerups'),
  pwShot: $('pw-shot'),
  pwSonar: $('pw-sonar'),
  pwBroadside: $('pw-broadside'),
  pwHint: $('pw-hint'),
  start: $('start-btn'),
  daily: $('daily-btn'),
  status: $('status-text'),
  playerBoard: $('player-board'),
  enemyBoard: $('enemy-board'),
  playerFleet: $('player-fleet'),
  enemyFleet: $('enemy-fleet'),
  radarRow: $('radar-row'),
  radar: $('radar-toggle'),
  log: $('log'),
  dialog: $('game-over'),
  resultTitle: $('result-title'),
  resultText: $('result-text'),
  resultExtra: $('result-extra'),
  playAgain: $('play-again-btn'),
  replayBtn: $('replay-btn'),
  share: $('share-btn'),
  closeResult: $('close-result-btn'),
  newGame: $('new-game-btn'),
  replayBar: $('replay-bar'),
  replayPrev: $('replay-prev'),
  replayPlay: $('replay-play'),
  replayNext: $('replay-next'),
  replayRange: $('replay-range'),
  replayLabel: $('replay-label'),
  replayExit: $('replay-exit'),
  statsBtn: $('stats-btn'),
  statsDialog: $('stats-dialog'),
  statsBody: $('stats-body'),
  statsClose: $('stats-close-btn'),
  statsReset: $('stats-reset-btn'),
  soundBtn: $('sound-btn'),
  themeBtn: $('theme-btn'),
  tipsBtn: $('tips-btn'),
  tipsDialog: $('tips-dialog'),
  tipsClose: $('tips-close-btn'),
  tipsParity: $('tips-parity'),
  tipsDensity: $('tips-density'),
  parrot: $('parrot'),
  toasts: $('toasts'),
};

let game;
let match = null; // { seed, difficulty, mode, date, fleet } once a battle starts
let selectedShip;
let orientation = HORIZONTAL;
let hoverCell = null;
let aiTimer = null;
let endTimer = null;
let drag = null;
let suppressClick = false;
let lastRecord = null;
let replayState = null;
let stats = loadStats(storage);
let theme = loadTheme(storage);
let campaign = loadCampaign(storage);
let weapon = 'shot';
let aimCell = null;

const coord = (r, c) => `${COLS[c]}${r + 1}`;
const shipName = (name) => theme.ships[name] ?? name;
const view = () => (replayState ? replayState.game : game);

// ---------- persistence ----------

function saveCurrent() {
  if (!storage) return;
  try {
    if (match && game.phase === 'playing') storage.setItem(SAVE_KEY, JSON.stringify(toRecord(game, match)));
    else storage.removeItem(SAVE_KEY);
  } catch { /* storage full or disabled */ }
}

function clearCurrent() {
  try { storage?.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

function resumeSaved() {
  let record;
  try {
    record = JSON.parse(storage?.getItem(SAVE_KEY) || 'null');
    if (!record) return false;
    const restored = replay(record);
    if (restored.phase !== 'playing') throw new Error('Saved game already finished');
    game = restored;
  } catch {
    clearCurrent();
    return false;
  }
  const { seed, difficulty, mode, date, fleet, powerups = false, captain = null } = record;
  match = { seed, difficulty, mode, date, fleet, powerups, captain };
  els.difficulty.value = difficulty;
  if (mode === 'classic') els.mode.value = powerups ? 'powerups' : 'classic';
  captainSays('start');
  els.setup.hidden = true;
  for (const m of game.moves) log(describe(m, m.who), logClass(m, m.who));
  log(theme.resumedLog, 'important');
  setStatus(theme.resumed);
  render();
  return true;
}

// ---------- game flow ----------

function newGame({ keepSave = false } = {}) {
  clearTimeout(aiTimer);
  clearTimeout(endTimer);
  aiTimer = endTimer = null;
  stopReplay();
  game = new Game();
  match = null;
  if (!keepSave) clearCurrent();
  selectedShip = FLEET[0].name;
  hoverCell = null;
  weapon = 'shot';
  aimCell = null;
  els.log.innerHTML = '';
  pirate.hush(els.parrot);
  els.captain.hidden = true;
  els.setup.hidden = false;
  setStatus(theme.setup);
  render();
}

function startMatch(mode, captain = null) {
  if (game.phase !== 'placement' || !game.allPlayerShipsPlaced()) return;
  const date = mode === 'daily' ? todayKey() : null;
  if (mode === 'daily' && stats.daily.results[date]) return;
  match = {
    seed: mode === 'daily' ? dailySeed(date) : randomSeed(),
    difficulty: captain ? captain.difficulty : mode === 'daily' ? DAILY_DIFFICULTY : els.difficulty.value,
    mode,
    date,
    fleet: fleetOf(game.player),
    powerups: captain ? captain.powerups : mode === 'classic' && els.mode.value === 'powerups',
    captain: captain?.id ?? null,
  };
  game = createMatch(match);
  saveCurrent();
  els.setup.hidden = true;
  setStatus(theme.started);
  log(startLine(), 'important');
  captainSays('start');
  sound.play('place');
  render();
}

function startLine() {
  if (match.mode === 'daily') return theme.dailyLog(dailyNumber(match.date));
  const cap = captainById(match.captain);
  if (cap) return `${cap.name} challenges you! ${label(cap.difficulty)} AI${cap.powerups ? ' with power-ups' : ''}.`;
  return theme.startLog(match.difficulty) + (match.powerups ? ' Power-ups are on.' : '');
}

const label = (d) => `${d[0].toUpperCase()}${d.slice(1)}`;

function onEnemyBoardClick(r, c) {
  if (replayState || game.phase !== 'playing' || game.turn !== 'player') return;
  const outcome = weapon === 'sonar' ? game.playerSonar(r, c)
    : weapon === 'broadside' ? game.playerBroadside(r, c, orientation)
    : game.playerFire(r, c);
  if (!outcome) return;
  weapon = 'shot';
  aimCell = null;
  saveCurrent();
  // Hand the turn to the AI before any rendering or effects, so a failure there can't stall the game.
  if (game.phase !== 'over') aiTimer = setTimeout(aiTurn, AI_DELAY_MS);
  present('player', outcome);
}

function aiTurn() {
  aiTimer = null;
  const outcome = game.aiFire();
  if (!outcome) return;
  present('ai', outcome);
}

// Sounds, log, effects and status for one turn: a shot, a sonar ping or a broadside volley.
function present(who, outcome) {
  const board = who === 'player' ? els.enemyBoard : els.playerBoard;
  const from = who === 'player' ? els.playerBoard : els.enemyBoard;
  const volley = outcome.result === 'broadside';
  const shots = volley ? outcome.outcomes : outcome.result === 'sonar' ? [] : [outcome];
  if (outcome.result === 'sonar') {
    sound.play('sonar');
    log(describe(outcome, who), who === 'player' ? 'player' : '');
  } else {
    sound.play('fire');
  }
  shots.forEach((o, i) => {
    sound.play(o.result === 'decoy' ? 'miss' : o.result, 0.12 + i * 0.18);
    log(describe(o, who, volley), logClass(o, who));
  });
  render();
  if (outcome.result === 'sonar') ping(board, outcome);
  shots.forEach((o, i) => {
    if (i === 0) strike(from, board, o);
    else setTimeout(() => strike(from, board, o), i * 180);
  });
  const top = shots.find((o) => o.result === 'sunk') || shots.find((o) => o.result === 'hit') || shots[shots.length - 1];
  parrotSays(`${who}-${top ? top.result : 'sonar'}`, top?.result === 'hit' || top?.result === 'sunk');
  if (top?.result === 'sunk') captainSays(who === 'ai' ? 'sink' : 'sunk');
  else if (top?.result === 'hit') captainSays(who === 'ai' ? 'hit' : 'hurt');
  if (game.phase === 'over') return endGame();
  let said;
  if (!top) said = who === 'player' ? theme.sonarFound(outcome.count) : theme.aiSonar(coord(outcome.row, outcome.col));
  else if (who === 'player') {
    said = top.result === 'miss' ? theme.playerMiss : top.result === 'hit' ? theme.playerHit
      : top.result === 'decoy' ? theme.playerDecoy : theme.playerSunk(shipName(top.ship.name));
  } else {
    said = top.result === 'miss' ? theme.aiMiss : top.result === 'hit' ? theme.aiHit
      : top.result === 'decoy' ? theme.aiDecoy : theme.aiSunk(shipName(top.ship.name));
  }
  setStatus(`${volley ? `${theme.broadside} ` : ''}${said} ${who === 'player' ? theme.aiming : theme.yourTurn}`);
}

function captainSays(event) {
  const cap = match && captainById(match.captain);
  els.captain.hidden = !cap;
  if (!cap) return;
  els.captainFace.textContent = cap.face;
  els.captainName.textContent = `${cap.name}:`;
  els.captainLine.textContent = `“${taunt(cap, event)}”`;
}

function summarize(g, m, won) {
  const { shots, hits } = g.stats.player;
  return {
    won,
    difficulty: m.difficulty,
    mode: m.mode,
    date: m.date,
    shots,
    hits,
    shipsLost: g.player.ships.filter(isSunk).length,
    powerups: Boolean(m.powerups),
    sequence: g.moves.filter((x) => x.who === 'player' && x.result !== 'sonar').map((x) => x.result),
  };
}

function endGame() {
  clearCurrent();
  render();
  const won = game.winner === 'player';
  const summary = summarize(game, match, won);
  lastRecord = toRecord(game, match);
  const prev = stats;
  const cap = captainById(match.captain);
  const extra = [];
  if (cap) {
    const c = recordCampaign(campaign, cap.id, won, summary.shots);
    campaign = c.progress;
    saveCampaign(storage, campaign);
    summary.campaignComplete = c.complete;
    if (!won) extra.push(`${cap.name} wins this round. Challenge them again from the campaign.`);
    else if (c.firstWin && c.complete) extra.push(`You defeated ${cap.name} and beat every captain on the seven seas!`);
    else if (c.next) extra.push(`You defeated ${cap.name}! ${c.next.name} is waiting for you in the campaign.`);
    else extra.push(`You defeated ${cap.name} again.`);
    captainSays(won ? 'lose' : 'win');
  }
  const result = recordGame(stats, summary);
  stats = result.stats;
  saveStats(storage, stats);

  const accuracy = summary.shots ? Math.round((summary.hits / summary.shots) * 100) : 0;
  setStatus(won ? theme.victory : theme.defeat);
  els.resultTitle.textContent = won ? theme.victoryTitle : theme.defeatTitle;
  els.resultText.textContent = `You fired ${summary.shots} shot${summary.shots === 1 ? '' : 's'} with ${accuracy}% accuracy.` +
    (won ? '' : ' Remaining enemy ships are now revealed.');
  if (match.mode === 'daily') extra.push(`Daily challenge #${dailyNumber(match.date)} complete. A new fleet arrives tomorrow.`);
  if (won && stats.streak > 1) extra.push(`Win streak: ${stats.streak}`);
  if (!won && prev.streak > 1) extra.push(`Your ${prev.streak}-win streak has ended.`);
  if (result.records.includes('fewestShotsWin')) extra.push(`New record: fewest shots to win (${summary.shots})!`);
  if (result.records.includes('bestAccuracy')) extra.push(`New record: best accuracy (${accuracy}%)!`);
  for (const id of result.unlocked) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    extra.push(`Achievement unlocked: ${a.name} — ${a.desc}`);
  }
  extra.push(`${theme.adviceLabel}: ${adviceFor(summary)}`);
  els.resultExtra.replaceChildren(...extra.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  els.share.hidden = match.mode !== 'daily';
  log(won ? theme.wonLog : theme.lostLog, 'important');
  sound.play(won ? 'win' : 'lose', 0.5);
  if (won) celebrate();
  const finale = theme.id === 'pirate';
  if (finale) pirateFinale(won);

  result.unlocked.forEach((id, i) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    setTimeout(() => {
      sound.play('achievement');
      toast(`Achievement unlocked: ${a.name}`, a.desc);
    }, 600 + i * 900);
  });
  endTimer = setTimeout(() => {
    endTimer = null;
    if (!els.dialog.open) els.dialog.showModal();
  }, reducedMotion.matches ? 0 : finale ? PIRATE_END_DELAY_MS : END_DELAY_MS);
}

function abandon() {
  if (game.phase !== 'playing' || !match) return;
  stats = recordGame(stats, summarize(game, match, false)).stats;
  saveStats(storage, stats);
}

// ---------- replay ----------

function startReplay() {
  if (!lastRecord) return;
  els.dialog.close();
  const total = replay(lastRecord).moves.length;
  replayState = { record: lastRecord, step: 0, total, game: null, timer: null };
  els.replayRange.max = total;
  els.replayBar.hidden = false;
  els.radar.checked = true;
  setReplayStep(0);
  toggleReplayPlay();
}

function setReplayStep(step, animate = false) {
  const rs = replayState;
  rs.step = Math.max(0, Math.min(rs.total, step));
  rs.game = replay(rs.record, rs.step);
  els.replayRange.value = rs.step;
  els.replayLabel.textContent = `Shot ${rs.step} of ${rs.total}`;
  const last = rs.game.moves[rs.game.moves.length - 1];
  setStatus(last ? `Replay — ${describe(last, last.who)}` : 'Replay — the battle begins.');
  render();
  if (animate && last && last.result !== 'sonar') {
    impact(last.who === 'player' ? els.enemyBoard : els.playerBoard, outcomeOf(rs.game, last));
    sound.play(last.result);
  }
  if (rs.step >= rs.total) pauseReplay();
}

function outcomeOf(g, move) {
  if (move.result !== 'sunk') return move;
  const board = move.who === 'player' ? g.enemy : g.player;
  const ship = board.ships.find((s) => s.name === move.ship);
  return { ...move, ship: { name: ship.name, cells: ship.cells } };
}

function toggleReplayPlay() {
  const rs = replayState;
  if (!rs) return;
  if (rs.timer) return pauseReplay();
  if (rs.step >= rs.total) setReplayStep(0);
  rs.timer = setInterval(() => setReplayStep(rs.step + 1, true), REPLAY_STEP_MS);
  els.replayPlay.textContent = '❚❚';
  els.replayPlay.setAttribute('aria-label', 'Pause');
}

function pauseReplay() {
  if (!replayState) return;
  clearInterval(replayState.timer);
  replayState.timer = null;
  els.replayPlay.textContent = '▶';
  els.replayPlay.setAttribute('aria-label', 'Play');
}

function stopReplay() {
  if (!replayState) return;
  pauseReplay();
  replayState = null;
  els.replayBar.hidden = true;
}

function exitReplay() {
  stopReplay();
  setStatus(game.winner === 'player' ? theme.victory : theme.defeat);
  render();
}

// ---------- rendering ----------

function buildBoard(container, onCellClick, ariaPrefix) {
  container.innerHTML = '';
  container.appendChild(Object.assign(document.createElement('span'), { className: 'label' }));
  for (let c = 0; c < BOARD_SIZE; c++) {
    container.appendChild(Object.assign(document.createElement('span'), { className: 'label', textContent: COLS[c] }));
  }
  for (let r = 0; r < BOARD_SIZE; r++) {
    container.appendChild(Object.assign(document.createElement('span'), { className: 'label', textContent: r + 1 }));
    for (let c = 0; c < BOARD_SIZE; c++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell';
      btn.dataset.row = r;
      btn.dataset.col = c;
      btn.setAttribute('aria-label', `${ariaPrefix} ${coord(r, c)}`);
      btn.addEventListener('click', () => onCellClick(r, c));
      container.appendChild(btn);
    }
  }
}

function cellEl(container, r, c) {
  return container.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
}

function lastMove(g, who) {
  for (let i = g.moves.length - 1; i >= 0; i--) if (g.moves[i].who === who) return key(g.moves[i].row, g.moves[i].col);
  return null;
}

function render() {
  const g = view();
  renderPicker();
  renderPlayerBoard(g);
  renderEnemyBoard(g);
  renderPowerups(g);
  renderFleet(els.playerFleet, g.player.ships, true);
  renderFleet(els.enemyFleet, g.enemy.ships, false);
  els.orientationLabel.textContent = orientation === HORIZONTAL ? 'Horizontal' : 'Vertical';
  els.start.disabled = !game.allPlayerShipsPlaced();
  renderDailyButton();
  els.newGame.hidden = game.phase === 'placement';
  els.newGame.classList.toggle('primary', game.phase === 'over');
  els.radarRow.hidden = g.phase === 'placement';
  els.playerBoard.classList.toggle('placing', game.phase === 'placement');
}

function renderDailyButton() {
  const date = todayKey();
  const done = stats.daily.results[date];
  const n = dailyNumber(date);
  els.daily.textContent = done ? theme.dailyDone(n, done.won) : theme.daily(n);
  els.daily.disabled = !done && !game.allPlayerShipsPlaced();
  els.daily.classList.toggle('done', Boolean(done));
}

function renderPicker() {
  els.picker.innerHTML = '';
  for (const spec of FLEET) {
    const placed = game.player.ships.find((s) => s.name === spec.name);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = placed ? 'placed' : '';
    btn.setAttribute('aria-pressed', String(spec.name === selectedShip));
    btn.innerHTML = `${shipName(spec.name)} <span class="pips" aria-hidden="true">${'<i></i>'.repeat(spec.size)}</span>`;
    btn.addEventListener('click', () => {
      if (suppressClick) return;
      if (placed) game.player.removeShip(spec.name);
      selectedShip = spec.name;
      render();
    });
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { name: spec.name, offset: 0, origin: placed ? originOf(placed) : null, start: null, moved: false };
    });
    els.picker.appendChild(btn);
  }
}

function previewCells() {
  if (replayState || game.phase !== 'placement' || !hoverCell || !selectedShip) return null;
  const spec = FLEET.find((s) => s.name === selectedShip);
  const [r, c] = hoverCell;
  return {
    ok: game.player.canPlace(r, c, spec.size, orientation, spec.name),
    cells: new Set(shipCells(r, c, spec.size, orientation).map(([pr, pc]) => key(pr, pc))),
  };
}

// Adds hull shape classes so each ship draws as one vessel with a bow and stern.
function shipShape(el, ship, r, c) {
  const i = ship.cells.findIndex(([sr, sc]) => sr === r && sc === c);
  el.classList.add(ship.orientation === HORIZONTAL ? 'h' : 'v');
  if (i === 0) el.classList.add('bow');
  if (i === ship.size - 1) el.classList.add('stern');
}

// Squares covered by each side's sonar pings: key -> { count, centre }.
function sonarMarks(g, who) {
  const marks = new Map();
  for (const m of g.moves) {
    if (m.who !== who || m.result !== 'sonar') continue;
    for (let r = m.row - 1; r <= m.row + 1; r++) {
      for (let c = m.col - 1; c <= m.col + 1; c++) {
        if (r >= 0 && c >= 0 && r < BOARD_SIZE && c < BOARD_SIZE) marks.set(key(r, c), { count: m.count, centre: r === m.row && c === m.col });
      }
    }
  }
  return marks;
}

function markSonar(el, mark) {
  if (mark) {
    el.classList.add('sonar');
    if (mark.count === 0) el.classList.add('sonar-clear');
  }
  if (mark?.centre) el.dataset.sonar = mark.count;
  else delete el.dataset.sonar;
  // Squares that already draw a marker or hull get the count as a corner badge in its own element.
  let badge = el.querySelector('.sonar-count');
  if (mark?.centre && el.matches('.miss, .hit, .decoy, .ship, .decoy-buoy')) {
    if (!badge) {
      badge = Object.assign(document.createElement('span'), { className: 'sonar-count' });
      badge.setAttribute('aria-hidden', 'true');
      el.appendChild(badge);
    }
    badge.textContent = mark.count;
  } else {
    badge?.remove();
  }
}

function aimCells() {
  if (!aimCell || weapon === 'shot' || replayState || game.phase !== 'playing') return null;
  const [r, c] = aimCell;
  const cells = [];
  if (weapon === 'sonar') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cells.push([r + dr, c + dc]);
  } else {
    cells.push(...shipCells(r, c, BROADSIDE_LENGTH, orientation));
  }
  return new Set(cells.map(([ar, ac]) => key(ar, ac)));
}

// Sonar can centre on a fired square, and a broadside can start on one if its line still has a target.
function canAimAt(g, r, c) {
  if (!g.charges.player[weapon]) return false;
  if (weapon === 'sonar') return true;
  return weapon === 'broadside' && shipCells(r, c, BROADSIDE_LENGTH, orientation)
    .some(([ar, ac]) => g.enemy.inBounds(ar, ac) && !g.enemy.isShot(ar, ac));
}

function renderPowerups(g) {
  els.powerups.hidden = !g.powerups || g.phase === 'placement';
  if (els.powerups.hidden) return;
  const live = !replayState && game.phase === 'playing' && game.turn === 'player';
  const ch = g.charges.player;
  if (weapon !== 'shot' && !ch[weapon]) weapon = 'shot';
  els.pwSonar.querySelector('.count').textContent = `×${ch.sonar}`;
  els.pwBroadside.querySelector('.count').textContent = `×${ch.broadside} ${orientation === HORIZONTAL ? '→' : '↓'}`;
  els.pwSonar.disabled = !live || !ch.sonar;
  els.pwBroadside.disabled = !live || !ch.broadside;
  els.pwShot.disabled = !live;
  for (const [btn, w] of [[els.pwShot, 'shot'], [els.pwSonar, 'sonar'], [els.pwBroadside, 'broadside']]) {
    btn.setAttribute('aria-pressed', String(weapon === w));
  }
  els.pwHint.textContent = weapon === 'sonar' ? 'Click a square to count the ship parts in the 3×3 area around it. Decoys show up too.'
    : weapon === 'broadside' ? 'Click a square to fire 3 shots in a row. Press R or tap Broadside again to turn it.'
    : 'One sonar ping, one broadside and a decoy each. Choose a weapon, then fire.';
}

function renderPlayerBoard(g) {
  const preview = previewCells();
  const sonar = sonarMarks(g, 'ai');
  const last = lastMove(g, 'ai');
  const heat = els.radar.checked && g.phase !== 'placement' && g.ai ? g.ai.heatmap() : null;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const el = cellEl(els.playerBoard, r, c);
      const k = key(r, c);
      const ship = g.player.shipAt(r, c);
      const shot = g.player.shots.get(k);
      el.className = 'cell';
      if (ship) {
        el.classList.add('ship');
        shipShape(el, ship, r, c);
      }
      if (shot) el.classList.add(shot);
      if (!shot && g.player.isDecoy(r, c)) el.classList.add('decoy-buoy');
      markSonar(el, sonar.get(k));
      if (ship && isSunk(ship)) el.classList.add('sunk');
      if (preview && preview.cells.has(k)) el.classList.add(preview.ok ? 'preview-ok' : 'preview-bad');
      if (last === k) el.classList.add('last');
      const h = heat?.get(k);
      if (h) {
        el.classList.add('heat');
        el.style.setProperty('--heat', h.toFixed(3));
      } else {
        el.style.removeProperty('--heat');
      }
      el.disabled = g !== game || game.phase !== 'placement';
      const desc = shot ? (ship && isSunk(ship) ? `sunk ${shipName(ship.name)}` : shot) : ship ? shipName(ship.name) : g.player.isDecoy(r, c) ? 'decoy' : 'water';
      el.setAttribute('aria-label', `Your board ${coord(r, c)}: ${desc}`);
    }
  }
}

function renderEnemyBoard(g) {
  const playing = g.phase === 'playing' && !replayState;
  const last = lastMove(g, 'player');
  const sonar = sonarMarks(g, 'player');
  const aim = aimCells();
  els.enemyBoard.classList.toggle('inactive', g.phase === 'placement');
  els.enemyBoard.classList.toggle('waiting', playing && g.turn !== 'player');
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const el = cellEl(els.enemyBoard, r, c);
      const shot = g.enemy.shots.get(key(r, c));
      const ship = g.enemy.shipAt(r, c);
      const sunk = ship && isSunk(ship);
      const reveal = (g.phase === 'over' || replayState) && ship;
      el.className = 'cell';
      if (shot) el.classList.add(shot);
      if (sunk || reveal) shipShape(el, ship, r, c);
      if (sunk) el.classList.add('ship', 'sunk');
      else if (reveal) el.classList.add('ship', 'revealed');
      if (!shot && (g.phase === 'over' || replayState) && g.enemy.isDecoy(r, c)) el.classList.add('decoy-buoy');
      const mark = sonar.get(key(r, c));
      markSonar(el, mark);
      if (aim?.has(key(r, c))) el.classList.add('aim');
      if (last === key(r, c)) el.classList.add('last');
      el.disabled = !playing || g.turn !== 'player' || (Boolean(shot) && !canAimAt(g, r, c));
      const desc = shot ? (sunk ? `sunk ${shipName(ship.name)}` : shot) : 'unknown';
      const sonarDesc = mark?.centre ? `, sonar found ${mark.count}` : '';
      el.setAttribute('aria-label', `Enemy board ${coord(r, c)}: ${desc}${sonarDesc}`);
    }
  }
}

function renderFleet(list, ships, own) {
  list.innerHTML = '';
  for (const spec of FLEET) {
    const ship = ships.find((s) => s.name === spec.name);
    const li = document.createElement('li');
    li.textContent = `${shipName(spec.name)} (${spec.size})`;
    if (ship && isSunk(ship)) li.classList.add('sunk');
    if (own && !ship) li.style.opacity = 0.5;
    list.appendChild(li);
  }
}

// ---------- effects ----------

function impact(board, outcome) {
  try {
    showImpact(board, outcome);
  } catch { /* effects are decoration only */ }
}

function showImpact(board, outcome) {
  const cells = outcome.result === 'sunk' ? outcome.ship.cells : [[outcome.row, outcome.col]];
  cells.forEach(([r, c], i) => {
    const el = cellEl(board, r, c);
    if (!el) return;
    const isShot = r === outcome.row && c === outcome.col;
    const span = document.createElement('span');
    const splash = outcome.result === 'miss' || outcome.result === 'decoy';
    span.className = `fx ${isShot ? (splash ? 'fx-miss' : 'fx-hit') : 'fx-sink'}`;
    span.setAttribute('aria-hidden', 'true');
    if (!isShot) span.style.animationDelay = `${150 + i * 80}ms`;
    span.addEventListener('animationend', () => span.remove());
    setTimeout(() => span.remove(), 2500);
    el.appendChild(span);
  });
  if (outcome.result === 'hit' || outcome.result === 'sunk') shake(board.closest('.board-wrap'), outcome.result === 'sunk' ? 9 : 4);
}

function ping(board, outcome) {
  try {
    for (let r = outcome.row - 1; r <= outcome.row + 1; r++) {
      for (let c = outcome.col - 1; c <= outcome.col + 1; c++) {
        const el = cellEl(board, r, c);
        if (!el) continue;
        const span = Object.assign(document.createElement('span'), { className: 'fx fx-sonar' });
        span.setAttribute('aria-hidden', 'true');
        span.style.animationDelay = `${(Math.abs(r - outcome.row) + Math.abs(c - outcome.col)) * 90}ms`;
        el.appendChild(span);
        setTimeout(() => span.remove(), 1500);
      }
    }
  } catch { /* decoration */ }
}

const pirateFx = () => theme.id === 'pirate' && !reducedMotion.matches;

// In pirate mode a cannonball flies to the target before the impact effects play.
function strike(from, board, outcome) {
  if (!pirateFx()) return impact(board, outcome);
  try {
    const target = cellEl(board, outcome.row, outcome.col);
    target?.classList.add('pending');
    pirate.cannonball(from, target).then(() => {
      target?.classList.remove('pending');
      impact(board, outcome);
      if (pirateFx()) try { pirate.boom(target, outcome.result); } catch { /* decoration */ }
    });
  } catch {
    impact(board, outcome);
  }
}

function parrotSays(event, loud = false) {
  if (theme.id !== 'pirate') return;
  try {
    pirate.squawk(els.parrot, event);
    if (loud) sound.play('squawk', 0.35);
  } catch { /* decoration */ }
}

function pirateFinale(won) {
  parrotSays(won ? 'win' : 'lose', true);
  sound.say(won ? 'Arrr! Victory be ours!' : "Arrr. To Davy Jones' locker with us.");
  if (reducedMotion.matches) return;
  try {
    if (won) pirate.swingingPirate();
    else pirate.kraken();
  } catch { /* decoration */ }
}

function shake(el, px) {
  if (reducedMotion.matches || !el?.animate) return;
  const frames = [0, -1, 1, -0.7, 0.7, -0.3, 0].map((f, i) => ({ transform: `translate(${f * px}px, ${(i % 2 ? 0.5 : -0.5) * f * px}px)` }));
  el.animate(frames, { duration: px > 5 ? 520 : 320, easing: 'ease-out' });
}

function celebrate() {
  if (reducedMotion.matches) return;
  const layer = document.createElement('div');
  layer.className = theme.id === 'pirate' ? 'confetti coins' : 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  const colors = theme.confetti;
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 240}px`);
    p.style.setProperty('--spin', `${Math.random() * 1080}deg`);
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3800);
}

// Re-show the popover so toasts sit in the top layer above any open modal dialog.
function raiseToasts() {
  if (!els.toasts.showPopover) return;
  if (els.toasts.matches(':popover-open')) els.toasts.hidePopover();
  els.toasts.showPopover();
}

function toast(title, body = '') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(Object.assign(document.createElement('strong'), { textContent: title }));
  if (body) el.append(Object.assign(document.createElement('span'), { textContent: body }));
  els.toasts.appendChild(el);
  raiseToasts();
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

// ---------- status, log, stats ----------

function setStatus(text) {
  els.status.textContent = text;
}

function log(text, cls = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (cls) li.className = cls;
  els.log.prepend(li);
}

function logClass(outcome, who) {
  const sunk = outcome.result === 'sunk';
  if (who === 'player') return sunk ? 'player important' : 'player';
  return sunk ? 'important' : '';
}

function describe(outcome, who, volley = false) {
  const at = coord(outcome.row, outcome.col);
  const actor = who === 'player' ? theme.you : theme.ai;
  if (outcome.result === 'sonar') return `${actor} pinged sonar at ${at}: ${outcome.count} contact${outcome.count === 1 ? '' : 's'}.`;
  const fired = volley || outcome.power === 'broadside' ? 'fired a broadside at' : 'fired at';
  if (outcome.result === 'miss') return `${actor} ${fired} ${at}: ${theme.missWord}`;
  if (outcome.result === 'decoy') return `${actor} ${fired} ${at}: ${theme.decoyWord}`;
  if (outcome.result === 'hit') return `${actor} ${fired} ${at}: hit!`;
  const owner = who === 'player' ? theme.theirs : theme.yours;
  return `${actor} ${fired} ${at}: sunk ${owner} ${shipName(outcome.ship?.name ?? outcome.ship)}!`;
}

function renderCampaign() {
  els.campaignList.replaceChildren(...CAPTAINS.map((cap, i) => {
    const open = isUnlocked(campaign, i);
    const best = campaign.beaten[cap.id];
    const li = document.createElement('li');
    li.className = best ? 'beaten' : open ? 'open' : 'locked';
    const status = best ? `Beaten · best win ${best.bestShots} shots` : open ? 'Ready for battle' : `Beat ${CAPTAINS[i - 1].name} to unlock`;
    li.innerHTML = `<span class="captain-face" aria-hidden="true">${cap.face}</span>
      <div class="captain-info"><strong>${i + 1}. ${cap.name}</strong>
      <span class="tag">${label(cap.difficulty)} AI${cap.powerups ? ' · Power-ups' : ''}</span>
      <p>${cap.blurb}</p><p class="small">${best ? '★ ' : open ? '' : '🔒 '}${status}</p></div>`;
    const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: best ? 'Rematch' : 'Battle', disabled: !open });
    btn.className = open && !best ? 'primary' : '';
    btn.dataset.captain = cap.id;
    btn.addEventListener('click', () => {
      els.campaignDialog.close();
      if (game.phase !== 'placement') newGame();
      if (!game.allPlayerShipsPlaced()) {
        try {
          game.player.placeMissingRandomly();
        } catch {
          game.player.placeFleetRandomly();
        }
      }
      startMatch('campaign', cap);
    });
    li.appendChild(btn);
    return li;
  }));
}

function renderStats() {
  const s = stats;
  const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
  const tiles = [
    ['Battles', s.played],
    ['Win rate', `${winRate(s)}%`],
    ['Win streak', s.streak],
    ['Best streak', s.bestStreak],
    ['Fewest shots to win', s.fewestShotsWin ?? '—'],
    ['Best accuracy', pct(s.bestAccuracy)],
    ['Lifetime accuracy', s.totalShots ? pct(s.totalHits / s.totalShots) : '—'],
    ['Daily streak', s.daily.streak],
  ];
  const rows = ['easy', 'medium', 'hard'].map((d) => {
    const x = s.byDifficulty[d];
    return `<tr><th scope="row">${d[0].toUpperCase()}${d.slice(1)}</th><td>${x.wins}</td><td>${x.played - x.wins}</td><td>${winRate(x)}%</td></tr>`;
  }).join('');
  const unlockedCount = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  const badges = ACHIEVEMENTS.map((a) => {
    const got = s.achievements[a.id];
    return `<li class="${got ? 'unlocked' : 'locked'}"><strong>${got ? '★' : '☆'} ${a.name}</strong><span>${a.desc}</span></li>`;
  }).join('');
  els.statsBody.innerHTML = `
    <div class="tiles">${tiles.map(([label, value]) => `<div class="tile"><span class="value">${value}</span><span class="label">${label}</span></div>`).join('')}</div>
    <table class="by-difficulty"><thead><tr><th scope="col">AI</th><th scope="col">Wins</th><th scope="col">Losses</th><th scope="col">Win rate</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Achievements (${unlockedCount}/${ACHIEVEMENTS.length})</h3>
    <ul class="badges">${badges}</ul>`;
}

async function shareResult(date) {
  const r = stats.daily.results[date];
  if (!r) return;
  const text = shareText({ date, ...r }, `${location.origin}${location.pathname}`, theme.shareTitle);
  try {
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Result copied', 'Paste it anywhere to challenge your friends.');
  } catch (e) {
    if (e?.name === 'AbortError') return;
    window.prompt('Copy your result:', text);
  }
}

function renderSoundButton() {
  const on = !sound.isMuted();
  els.soundBtn.textContent = on ? 'Sound on' : 'Sound off';
  els.soundBtn.setAttribute('aria-pressed', String(on));
}

// Rewrites the status line and battle log in the current theme's wording.
function retellBattle() {
  els.log.replaceChildren();
  if (match) log(startLine(), 'important');
  for (const m of game.moves) log(describe(m, m.who), logClass(m, m.who));
  if (game.phase === 'placement') setStatus(theme.setup);
  else if (game.phase === 'over') {
    log(game.winner === 'player' ? theme.wonLog : theme.lostLog, 'important');
    if (replayState) setReplayStep(replayState.step);
    else setStatus(game.winner === 'player' ? theme.victory : theme.defeat);
  } else setStatus(game.turn === 'player' ? theme.yourTurn : theme.aiming);
}

function renderTips() {
  if (els.tipsParity.childElementCount) return;
  const density = placementDensity();
  const max = Math.max(...density.flat());
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      els.tipsParity.appendChild(Object.assign(document.createElement('i'), { className: (r + c) % 2 ? '' : 'on' }));
      const heat = document.createElement('i');
      heat.style.setProperty('--h', (density[r][c] / max).toFixed(2));
      els.tipsDensity.appendChild(heat);
    }
  }
}

function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  document.title = theme.docTitle;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);
  document.querySelector('link[rel="icon"]')?.setAttribute('href',
    `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${theme.icon}</text></svg>`);
  for (const el of document.querySelectorAll('[data-text]')) el.textContent = theme[el.dataset.text];
  els.themeBtn.setAttribute('aria-pressed', String(theme.id === 'pirate'));
  sound.setVariant(theme.id);
}

// ---------- placement (click, keyboard and drag) ----------

function rotate() {
  orientation = orientation === HORIZONTAL ? VERTICAL : HORIZONTAL;
  if (drag?.moved) updateDragHover();
  render();
}

function chooseWeapon(w) {
  if (w === 'broadside' && weapon === 'broadside') return rotate();
  weapon = w;
  render();
}

function aimAt(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  aimCell = [Number(cell.dataset.row), Number(cell.dataset.col)];
  if (weapon !== 'shot') renderEnemyBoard(view());
}

function updateDragHover() {
  const at = drag.at;
  hoverCell = at && [
    at[0] - (orientation === VERTICAL ? drag.offset : 0),
    at[1] - (orientation === HORIZONTAL ? drag.offset : 0),
  ];
}

function originOf(ship) {
  return [ship.cells[0][0], ship.cells[0][1], ship.orientation];
}

function selectNextUnplaced() {
  const next = FLEET.find((s) => !game.player.ships.some((p) => p.name === s.name));
  selectedShip = next ? next.name : null;
}

function onPlayerBoardClick(r, c) {
  if (suppressClick || game.phase !== 'placement') return;
  const existing = game.player.shipAt(r, c);
  if (existing && existing.name !== selectedShip) {
    game.player.removeShip(existing.name);
    selectedShip = existing.name;
    orientation = existing.orientation;
    render();
    return;
  }
  const spec = FLEET.find((s) => s.name === selectedShip);
  if (!spec) return;
  if (!game.player.canPlace(r, c, spec.size, orientation, spec.name)) return;
  game.player.removeShip(spec.name);
  game.player.placeShip(spec, r, c, orientation);
  sound.play('place');
  selectNextUnplaced();
  render();
}

function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.('.cell');
  return el && els.playerBoard.contains(el) ? [Number(el.dataset.row), Number(el.dataset.col)] : null;
}

els.playerBoard.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'placement' || e.button !== 0) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const r = Number(cell.dataset.row);
  const c = Number(cell.dataset.col);
  const ship = game.player.shipAt(r, c);
  if (!ship) return;
  const offset = ship.cells.findIndex(([sr, sc]) => sr === r && sc === c);
  drag = { name: ship.name, offset, origin: originOf(ship), start: key(r, c), moved: false };
});

document.addEventListener('pointermove', (e) => {
  if (!drag || game.phase !== 'placement') return;
  const at = cellFromPoint(e.clientX, e.clientY);
  if (!drag.moved) {
    if (!at || key(...at) === drag.start) return;
    drag.moved = true;
    if (drag.origin) {
      game.player.removeShip(drag.name);
      orientation = drag.origin[2];
    }
    selectedShip = drag.name;
    document.body.classList.add('dragging');
    render();
  }
  e.preventDefault();
  drag.at = at;
  updateDragHover();
  renderPlayerBoard(game);
});

function endDrag(drop) {
  const d = drag;
  drag = null;
  if (!d || !d.moved) return;
  document.body.classList.remove('dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const spec = FLEET.find((s) => s.name === d.name);
  if (drop && hoverCell && game.player.canPlace(hoverCell[0], hoverCell[1], spec.size, orientation, spec.name)) {
    game.player.placeShip(spec, hoverCell[0], hoverCell[1], orientation);
    sound.play('place');
    selectNextUnplaced();
  } else if (d.origin) {
    game.player.placeShip(spec, d.origin[0], d.origin[1], d.origin[2]);
    orientation = d.origin[2];
  }
  hoverCell = null;
  render();
}
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));

function previewAt(e) {
  if (drag?.moved) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  hoverCell = [Number(cell.dataset.row), Number(cell.dataset.col)];
  renderPlayerBoard(view());
}

// ---------- wiring ----------

buildBoard(els.playerBoard, onPlayerBoardClick, 'Your board');
buildBoard(els.enemyBoard, onEnemyBoardClick, 'Enemy board');

els.playerBoard.addEventListener('mouseover', previewAt);
els.playerBoard.addEventListener('focusin', previewAt);
els.enemyBoard.addEventListener('mouseover', aimAt);
els.enemyBoard.addEventListener('focusin', aimAt);
els.enemyBoard.addEventListener('mouseleave', () => {
  aimCell = null;
  renderEnemyBoard(view());
});
els.pwShot.addEventListener('click', () => chooseWeapon('shot'));
els.pwSonar.addEventListener('click', () => chooseWeapon('sonar'));
els.pwBroadside.addEventListener('click', () => chooseWeapon('broadside'));
els.campaignBtn.addEventListener('click', () => {
  renderCampaign();
  els.campaignDialog.showModal();
});
els.campaignClose.addEventListener('click', () => els.campaignDialog.close());
els.playerBoard.addEventListener('mouseleave', () => {
  if (drag?.moved) return;
  hoverCell = null;
  renderPlayerBoard(view());
});

els.rotate.addEventListener('click', rotate);
els.random.addEventListener('click', () => {
  game.player.placeFleetRandomly();
  selectedShip = null;
  sound.play('place');
  render();
});
els.clear.addEventListener('click', () => {
  game.player.clear();
  selectedShip = FLEET[0].name;
  render();
});
els.start.addEventListener('click', () => startMatch('classic'));
els.daily.addEventListener('click', () => {
  const date = todayKey();
  if (stats.daily.results[date]) shareResult(date);
  else startMatch('daily');
});
els.newGame.addEventListener('click', () => {
  if (game.phase === 'playing') {
    const msg = match?.mode === 'daily'
      ? 'Abandon today\'s daily challenge? It will count as a loss and you won\'t be able to retry until tomorrow.'
      : 'Abandon this battle and start a new game? It will count as a loss.';
    if (!window.confirm(msg)) return;
    abandon();
  }
  newGame();
});
els.playAgain.addEventListener('click', () => {
  els.dialog.close();
  const fromCampaign = match?.mode === 'campaign';
  newGame();
  if (fromCampaign) {
    renderCampaign();
    els.campaignDialog.showModal();
  }
});
els.replayBtn.addEventListener('click', startReplay);
els.share.addEventListener('click', () => match?.date && shareResult(match.date));
els.closeResult.addEventListener('click', () => els.dialog.close());

els.replayPrev.addEventListener('click', () => { pauseReplay(); setReplayStep(replayState.step - 1); });
els.replayNext.addEventListener('click', () => { pauseReplay(); setReplayStep(replayState.step + 1, true); });
els.replayPlay.addEventListener('click', toggleReplayPlay);
els.replayRange.addEventListener('input', () => { pauseReplay(); setReplayStep(Number(els.replayRange.value)); });
els.replayExit.addEventListener('click', exitReplay);
els.radar.addEventListener('change', () => renderPlayerBoard(view()));

els.statsBtn.addEventListener('click', () => {
  renderStats();
  els.statsDialog.showModal();
});
els.statsClose.addEventListener('click', () => els.statsDialog.close());
els.tipsBtn.addEventListener('click', () => {
  renderTips();
  els.tipsDialog.showModal();
  els.tipsDialog.scrollTop = 0;
});
els.tipsClose.addEventListener('click', () => els.tipsDialog.close());
els.statsReset.addEventListener('click', () => {
  if (!window.confirm('Reset all stats, achievements and daily results? This cannot be undone.')) return;
  stats = emptyStats();
  saveStats(storage, stats);
  renderStats();
  render();
});
els.themeBtn.addEventListener('click', () => {
  theme = theme.id === 'pirate' ? THEMES.navy : THEMES.pirate;
  document.querySelectorAll('.cannonball, .boom, .pirate-swing, .kraken').forEach((el) => el.remove());
  saveTheme(storage, theme.id);
  applyTheme();
  retellBattle();
  render();
  sound.play('place');
});
els.soundBtn.addEventListener('click', () => {
  sound.setMuted(!sound.isMuted());
  renderSoundButton();
  sound.play('place');
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.key === 'r' || e.key === 'R') && (game.phase === 'placement' || (game.phase === 'playing' && weapon === 'broadside'))) rotate();
  if (replayState && !document.querySelector('dialog[open]') && e.target.tagName !== 'INPUT') {
    if (e.key === 'ArrowLeft') { pauseReplay(); setReplayStep(replayState.step - 1); }
    if (e.key === 'ArrowRight') { pauseReplay(); setReplayStep(replayState.step + 1, true); }
  }
});

applyTheme();
renderSoundButton();
newGame({ keepSave: true });
resumeSaved();
