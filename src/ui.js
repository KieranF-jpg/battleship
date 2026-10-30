import { BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL, Game, key, shipCells, isSunk } from './game.js';
import { AI } from './ai.js';

const AI_DELAY_MS = 650;
const COLS = 'ABCDEFGHIJ';
const $ = (id) => document.getElementById(id);

const els = {
  setup: $('setup'),
  picker: $('ship-picker'),
  rotate: $('rotate-btn'),
  orientationLabel: $('orientation-label'),
  random: $('random-btn'),
  clear: $('clear-btn'),
  difficulty: $('difficulty'),
  start: $('start-btn'),
  status: $('status-text'),
  playerBoard: $('player-board'),
  enemyBoard: $('enemy-board'),
  playerFleet: $('player-fleet'),
  enemyFleet: $('enemy-fleet'),
  log: $('log'),
  dialog: $('game-over'),
  resultTitle: $('result-title'),
  resultText: $('result-text'),
  playAgain: $('play-again-btn'),
  newGame: $('new-game-btn'),
};

let game;
let selectedShip;
let orientation = HORIZONTAL;
let hoverCell = null;
let aiTimer = null;
let lastShot = { player: null, ai: null };

const coord = (r, c) => `${COLS[c]}${r + 1}`;

function newGame() {
  clearTimeout(aiTimer);
  aiTimer = null;
  game = new Game({ ai: new AI({ difficulty: els.difficulty.value }) });
  selectedShip = FLEET[0].name;
  lastShot = { player: null, ai: null };
  hoverCell = null;
  els.log.innerHTML = '';
  els.setup.hidden = false;
  els.difficulty.disabled = false;
  setStatus('Place your ships to begin.');
  render();
}

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

function render() {
  renderPicker();
  renderPlayerBoard();
  renderEnemyBoard();
  renderFleet(els.playerFleet, game.player.ships, true);
  renderFleet(els.enemyFleet, game.enemy.ships, false);
  els.orientationLabel.textContent = orientation === HORIZONTAL ? 'Horizontal' : 'Vertical';
  els.start.disabled = !game.allPlayerShipsPlaced();
  els.newGame.hidden = game.phase === 'placement';
  els.newGame.classList.toggle('primary', game.phase === 'over');
}

function renderPicker() {
  els.picker.innerHTML = '';
  for (const spec of FLEET) {
    const placed = game.player.ships.some((s) => s.name === spec.name);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = placed ? 'placed' : '';
    btn.setAttribute('aria-pressed', String(spec.name === selectedShip));
    btn.innerHTML = `${spec.name} <span class="pips" aria-hidden="true">${'<i></i>'.repeat(spec.size)}</span>`;
    btn.addEventListener('click', () => {
      if (placed) game.player.removeShip(spec.name);
      selectedShip = spec.name;
      render();
    });
    els.picker.appendChild(btn);
  }
}

function previewCells() {
  if (game.phase !== 'placement' || !hoverCell || !selectedShip) return null;
  const spec = FLEET.find((s) => s.name === selectedShip);
  const [r, c] = hoverCell;
  return {
    ok: game.player.canPlace(r, c, spec.size, orientation, spec.name),
    cells: new Set(shipCells(r, c, spec.size, orientation).map(([pr, pc]) => key(pr, pc))),
  };
}

function renderPlayerBoard() {
  const preview = previewCells();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const el = cellEl(els.playerBoard, r, c);
      const ship = game.player.shipAt(r, c);
      const shot = game.player.shots.get(key(r, c));
      el.className = 'cell';
      if (ship) el.classList.add('ship');
      if (shot) el.classList.add(shot);
      if (ship && isSunk(ship)) el.classList.add('sunk');
      if (preview && preview.cells.has(key(r, c))) el.classList.add(preview.ok ? 'preview-ok' : 'preview-bad');
      if (lastShot.ai === key(r, c)) el.classList.add('last');
      el.disabled = game.phase !== 'placement';
      const desc = shot ? (ship && isSunk(ship) ? `sunk ${ship.name}` : shot) : ship ? ship.name : 'water';
      el.setAttribute('aria-label', `Your board ${coord(r, c)}: ${desc}`);
    }
  }
}

function renderEnemyBoard() {
  const playing = game.phase === 'playing';
  els.enemyBoard.classList.toggle('inactive', game.phase === 'placement');
  els.enemyBoard.classList.toggle('waiting', playing && game.turn !== 'player');
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const el = cellEl(els.enemyBoard, r, c);
      const shot = game.enemy.shots.get(key(r, c));
      const ship = game.enemy.shipAt(r, c);
      const sunk = ship && isSunk(ship);
      const reveal = game.phase === 'over' && ship;
      el.className = 'cell';
      if (shot) el.classList.add(shot);
      if (sunk) el.classList.add('sunk');
      else if (reveal && !shot) el.classList.add('ship');
      if (lastShot.player === key(r, c)) el.classList.add('last');
      el.disabled = !playing || game.turn !== 'player' || Boolean(shot);
      const desc = shot ? (sunk ? `sunk ${ship.name}` : shot) : 'unknown';
      el.setAttribute('aria-label', `Enemy board ${coord(r, c)}: ${desc}`);
    }
  }
}

function renderFleet(list, ships, own) {
  list.innerHTML = '';
  for (const spec of FLEET) {
    const ship = ships.find((s) => s.name === spec.name);
    const li = document.createElement('li');
    li.textContent = `${spec.name} (${spec.size})`;
    if (ship && isSunk(ship)) li.classList.add('sunk');
    if (own && !ship) li.style.opacity = 0.5;
    list.appendChild(li);
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

function log(text, cls = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (cls) li.className = cls;
  els.log.prepend(li);
}

function describe(outcome, who) {
  const at = coord(outcome.row, outcome.col);
  const actor = who === 'player' ? 'You' : 'AI';
  if (outcome.result === 'miss') return `${actor} fired at ${at}: miss.`;
  if (outcome.result === 'hit') return `${actor} fired at ${at}: hit!`;
  const owner = who === 'player' ? 'the enemy' : 'your';
  return `${actor} fired at ${at}: sunk ${owner} ${outcome.ship.name}!`;
}

function onPlayerBoardClick(r, c) {
  if (game.phase !== 'placement') return;
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
  const next = FLEET.find((s) => !game.player.ships.some((p) => p.name === s.name));
  selectedShip = next ? next.name : null;
  render();
}

function onEnemyBoardClick(r, c) {
  if (game.phase !== 'playing' || game.turn !== 'player') return;
  const outcome = game.playerFire(r, c);
  if (!outcome) return;
  lastShot.player = key(r, c);
  log(describe(outcome, 'player'), outcome.result === 'sunk' ? 'player important' : 'player');
  if (game.phase === 'over') return endGame();
  setStatus(outcome.result === 'miss' ? 'Miss. The AI is aiming…' : 'Hit! The AI is aiming…');
  render();
  aiTimer = setTimeout(aiTurn, AI_DELAY_MS);
}

function aiTurn() {
  aiTimer = null;
  const outcome = game.aiFire();
  if (!outcome) return;
  lastShot.ai = key(outcome.row, outcome.col);
  log(describe(outcome, 'ai'), outcome.result === 'sunk' ? 'important' : '');
  if (game.phase === 'over') return endGame();
  const prefix = outcome.result === 'miss' ? 'The AI missed.' : outcome.result === 'hit' ? 'The AI hit your ship!' : `The AI sank your ${outcome.ship.name}!`;
  setStatus(`${prefix} Your turn — fire on the enemy waters.`);
  render();
}

function endGame() {
  render();
  const won = game.winner === 'player';
  const { shots, hits } = game.stats.player;
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  setStatus(won ? 'Victory! You sank the entire enemy fleet.' : 'Defeat. The AI sank your fleet.');
  els.resultTitle.textContent = won ? 'Victory!' : 'Defeat';
  els.resultText.textContent = `You fired ${shots} shots with ${accuracy}% accuracy.` +
    (won ? '' : ' Remaining enemy ships are now revealed.');
  log(won ? 'You won the battle!' : 'The AI won the battle.', 'important');
  els.dialog.showModal();
}

function onStart() {
  if (!game.allPlayerShipsPlaced()) return;
  game.start();
  els.setup.hidden = true;
  setStatus('Battle started! Fire on the enemy waters.');
  log(`Battle started against the ${els.difficulty.value} AI.`, 'important');
  render();
}

function rotate() {
  orientation = orientation === HORIZONTAL ? VERTICAL : HORIZONTAL;
  render();
}

buildBoard(els.playerBoard, onPlayerBoardClick, 'Your board');
buildBoard(els.enemyBoard, onEnemyBoardClick, 'Enemy board');

function previewAt(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  hoverCell = [Number(cell.dataset.row), Number(cell.dataset.col)];
  renderPlayerBoard();
}
els.playerBoard.addEventListener('mouseover', previewAt);
els.playerBoard.addEventListener('focusin', previewAt);
els.playerBoard.addEventListener('mouseleave', () => {
  hoverCell = null;
  renderPlayerBoard();
});

els.rotate.addEventListener('click', rotate);
els.random.addEventListener('click', () => {
  game.player.placeFleetRandomly();
  selectedShip = null;
  render();
});
els.clear.addEventListener('click', () => {
  game.player.clear();
  selectedShip = FLEET[0].name;
  render();
});
els.difficulty.addEventListener('change', () => {
  game.ai = new AI({ difficulty: els.difficulty.value });
});
els.start.addEventListener('click', onStart);
els.newGame.addEventListener('click', () => {
  if (game.phase === 'playing' && !window.confirm('Abandon this battle and start a new game?')) return;
  newGame();
});
els.playAgain.addEventListener('click', () => {
  els.dialog.close();
  newGame();
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'r' || e.key === 'R') && game.phase === 'placement' && !e.ctrlKey && !e.metaKey) rotate();
});

newGame();
