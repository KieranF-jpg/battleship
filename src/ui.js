import { BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL, Game, key, shipCells, isSunk } from './game.js';
import { createMatch, fleetOf, replay, toRecord } from './match.js';
import { randomSeed } from './rng.js';
import { DAILY_DIFFICULTY, dailyNumber, dailySeed, shareText, todayKey } from './daily.js';
import { ACHIEVEMENTS, emptyStats, loadStats, recordGame, saveStats, winRate } from './stats.js';
import * as sound from './sound.js';
import { THEMES, loadTheme, saveTheme } from './theme.js';
import * as pirate from './pirate.js';
import { adviceFor, placementDensity } from './tips.js';

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
  const { seed, difficulty, mode, date, fleet } = record;
  match = { seed, difficulty, mode, date, fleet };
  els.difficulty.value = difficulty;
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
  els.log.innerHTML = '';
  els.setup.hidden = false;
  setStatus(theme.setup);
  render();
}

function startMatch(mode) {
  if (game.phase !== 'placement' || !game.allPlayerShipsPlaced()) return;
  const date = mode === 'daily' ? todayKey() : null;
  if (mode === 'daily' && stats.daily.results[date]) return;
  match = {
    seed: mode === 'daily' ? dailySeed(date) : randomSeed(),
    difficulty: mode === 'daily' ? DAILY_DIFFICULTY : els.difficulty.value,
    mode,
    date,
    fleet: fleetOf(game.player),
  };
  game = createMatch(match);
  saveCurrent();
  els.setup.hidden = true;
  setStatus(theme.started);
  log(mode === 'daily' ? theme.dailyLog(dailyNumber(date)) : theme.startLog(match.difficulty), 'important');
  sound.play('place');
  render();
}

function onEnemyBoardClick(r, c) {
  if (replayState || game.phase !== 'playing' || game.turn !== 'player') return;
  const outcome = game.playerFire(r, c);
  if (!outcome) return;
  saveCurrent();
  // Hand the turn to the AI before any rendering or effects, so a failure there can't stall the game.
  if (game.phase !== 'over') aiTimer = setTimeout(aiTurn, AI_DELAY_MS);
  sound.play('fire');
  sound.play(outcome.result, 0.12);
  log(describe(outcome, 'player'), logClass(outcome, 'player'));
  render();
  strike(els.playerBoard, els.enemyBoard, outcome);
  parrotSays(`player-${outcome.result}`, outcome.result !== 'miss');
  if (game.phase === 'over') return endGame();
  const said = outcome.result === 'miss' ? theme.playerMiss : outcome.result === 'hit' ? theme.playerHit : theme.playerSunk(shipName(outcome.ship.name));
  setStatus(`${said} ${theme.aiming}`);
}

function aiTurn() {
  aiTimer = null;
  const outcome = game.aiFire();
  if (!outcome) return;
  sound.play('fire');
  sound.play(outcome.result, 0.12);
  log(describe(outcome, 'ai'), logClass(outcome, 'ai'));
  render();
  strike(els.enemyBoard, els.playerBoard, outcome);
  parrotSays(`ai-${outcome.result}`, outcome.result !== 'miss');
  if (game.phase === 'over') return endGame();
  const prefix = outcome.result === 'miss' ? theme.aiMiss : outcome.result === 'hit' ? theme.aiHit : theme.aiSunk(shipName(outcome.ship.name));
  setStatus(`${prefix} ${theme.yourTurn}`);
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
    sequence: g.moves.filter((x) => x.who === 'player').map((x) => x.result),
  };
}

function endGame() {
  clearCurrent();
  render();
  const won = game.winner === 'player';
  const summary = summarize(game, match, won);
  lastRecord = toRecord(game, match);
  const prev = stats;
  const result = recordGame(stats, summary);
  stats = result.stats;
  saveStats(storage, stats);

  const accuracy = summary.shots ? Math.round((summary.hits / summary.shots) * 100) : 0;
  setStatus(won ? theme.victory : theme.defeat);
  els.resultTitle.textContent = won ? theme.victoryTitle : theme.defeatTitle;
  els.resultText.textContent = `You fired ${summary.shots} shot${summary.shots === 1 ? '' : 's'} with ${accuracy}% accuracy.` +
    (won ? '' : ' Remaining enemy ships are now revealed.');
  const extra = [];
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
  if (animate && last) {
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

function renderPlayerBoard(g) {
  const preview = previewCells();
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
      const desc = shot ? (ship && isSunk(ship) ? `sunk ${shipName(ship.name)}` : shot) : ship ? shipName(ship.name) : 'water';
      el.setAttribute('aria-label', `Your board ${coord(r, c)}: ${desc}`);
    }
  }
}

function renderEnemyBoard(g) {
  const playing = g.phase === 'playing' && !replayState;
  const last = lastMove(g, 'player');
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
      if (last === key(r, c)) el.classList.add('last');
      el.disabled = !playing || g.turn !== 'player' || Boolean(shot);
      const desc = shot ? (sunk ? `sunk ${shipName(ship.name)}` : shot) : 'unknown';
      el.setAttribute('aria-label', `Enemy board ${coord(r, c)}: ${desc}`);
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
    span.className = `fx ${isShot ? (outcome.result === 'miss' ? 'fx-miss' : 'fx-hit') : 'fx-sink'}`;
    span.setAttribute('aria-hidden', 'true');
    if (!isShot) span.style.animationDelay = `${150 + i * 80}ms`;
    span.addEventListener('animationend', () => span.remove());
    setTimeout(() => span.remove(), 2500);
    el.appendChild(span);
  });
  if (outcome.result !== 'miss') shake(board.closest('.board-wrap'), outcome.result === 'sunk' ? 9 : 4);
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
      try { pirate.boom(target, outcome.result); } catch { /* decoration */ }
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

function describe(outcome, who) {
  const at = coord(outcome.row, outcome.col);
  const actor = who === 'player' ? theme.you : theme.ai;
  if (outcome.result === 'miss') return `${actor} fired at ${at}: ${theme.missWord}`;
  if (outcome.result === 'hit') return `${actor} fired at ${at}: hit!`;
  const owner = who === 'player' ? theme.theirs : theme.yours;
  return `${actor} fired at ${at}: sunk ${owner} ${shipName(outcome.ship?.name ?? outcome.ship)}!`;
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
  if (match) log(match.mode === 'daily' ? theme.dailyLog(dailyNumber(match.date)) : theme.startLog(match.difficulty), 'important');
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
  newGame();
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
  if ((e.key === 'r' || e.key === 'R') && game.phase === 'placement') rotate();
  if (replayState && !document.querySelector('dialog[open]') && e.target.tagName !== 'INPUT') {
    if (e.key === 'ArrowLeft') { pauseReplay(); setReplayStep(replayState.step - 1); }
    if (e.key === 'ArrowRight') { pauseReplay(); setReplayStep(replayState.step + 1, true); }
  }
});

applyTheme();
renderSoundButton();
newGame({ keepSave: true });
resumeSaved();
