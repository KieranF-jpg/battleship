export const BOARD_SIZE = 10;

export const FLEET = Object.freeze([
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
]);

export const HORIZONTAL = 'H';
export const VERTICAL = 'V';

export const key = (row, col) => `${row},${col}`;

export function shipCells(row, col, size, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(orientation === HORIZONTAL ? [row, col + i] : [row + i, col]);
  }
  return cells;
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.ships = [];
    this.shots = new Map();
  }

  inBounds(row, col) {
    return Number.isInteger(row) && Number.isInteger(col) &&
      row >= 0 && col >= 0 && row < this.size && col < this.size;
  }

  shipAt(row, col) {
    return this.ships.find((s) => s.cells.some(([r, c]) => r === row && c === col)) || null;
  }

  canPlace(row, col, size, orientation, ignoreName = null) {
    return shipCells(row, col, size, orientation).every(([r, c]) => {
      if (!this.inBounds(r, c)) return false;
      const other = this.shipAt(r, c);
      return !other || other.name === ignoreName;
    });
  }

  placeShip(spec, row, col, orientation) {
    if (this.ships.some((s) => s.name === spec.name)) {
      throw new Error(`${spec.name} is already placed`);
    }
    if (!this.canPlace(row, col, spec.size, orientation)) {
      throw new Error(`Cannot place ${spec.name} at ${row},${col}`);
    }
    const ship = {
      name: spec.name,
      size: spec.size,
      orientation,
      cells: shipCells(row, col, spec.size, orientation),
      hits: new Set(),
    };
    this.ships.push(ship);
    return ship;
  }

  removeShip(name) {
    this.ships = this.ships.filter((s) => s.name !== name);
  }

  clear() {
    this.ships = [];
    this.shots.clear();
  }

  placeFleetRandomly(fleet = FLEET, rng = Math.random) {
    this.ships = [];
    for (const spec of fleet) {
      const options = [];
      for (const orientation of [HORIZONTAL, VERTICAL]) {
        for (let r = 0; r < this.size; r++) {
          for (let c = 0; c < this.size; c++) {
            if (this.canPlace(r, c, spec.size, orientation)) options.push([r, c, orientation]);
          }
        }
      }
      if (options.length === 0) throw new Error(`No room for ${spec.name}`);
      const [r, c, o] = options[Math.floor(rng() * options.length)];
      this.placeShip(spec, r, c, o);
    }
  }

  isShot(row, col) {
    return this.shots.has(key(row, col));
  }

  receiveShot(row, col) {
    if (!this.inBounds(row, col)) throw new Error(`Shot out of bounds: ${row},${col}`);
    if (this.isShot(row, col)) throw new Error(`Cell already targeted: ${row},${col}`);
    const ship = this.shipAt(row, col);
    if (!ship) {
      this.shots.set(key(row, col), 'miss');
      return { result: 'miss', row, col };
    }
    this.shots.set(key(row, col), 'hit');
    ship.hits.add(key(row, col));
    if (isSunk(ship)) {
      return { result: 'sunk', row, col, ship: { name: ship.name, size: ship.size, cells: ship.cells.map((c) => [...c]) } };
    }
    return { result: 'hit', row, col };
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every(isSunk);
  }

  remainingShips() {
    return this.ships.filter((s) => !isSunk(s));
  }
}

export function isSunk(ship) {
  return ship.hits.size === ship.size;
}

export class Game {
  constructor({ ai, rng = Math.random } = {}) {
    this.rng = rng;
    this.ai = ai;
    this.player = new Board();
    this.enemy = new Board();
    this.phase = 'placement';
    this.turn = 'player';
    this.winner = null;
    this.stats = { player: { shots: 0, hits: 0 }, ai: { shots: 0, hits: 0 } };
    this.moves = [];
  }

  allPlayerShipsPlaced() {
    return FLEET.every((spec) => this.player.ships.some((s) => s.name === spec.name));
  }

  start() {
    if (this.phase !== 'placement') throw new Error('Game already started');
    if (!this.allPlayerShipsPlaced()) throw new Error('Place all ships first');
    this.enemy.placeFleetRandomly(FLEET, this.rng);
    this.phase = 'playing';
    this.turn = 'player';
  }

  playerFire(row, col) {
    if (this.phase !== 'playing' || this.turn !== 'player') return null;
    if (!this.enemy.inBounds(row, col) || this.enemy.isShot(row, col)) return null;
    const outcome = this.enemy.receiveShot(row, col);
    this.record('player', outcome);
    if (this.enemy.allSunk()) this.finish('player');
    else this.turn = 'ai';
    return outcome;
  }

  aiFire() {
    if (this.phase !== 'playing' || this.turn !== 'ai') return null;
    const [row, col] = this.ai.chooseShot();
    const outcome = this.player.receiveShot(row, col);
    this.ai.recordResult(outcome);
    this.record('ai', outcome);
    if (this.player.allSunk()) this.finish('ai');
    else this.turn = 'player';
    return outcome;
  }

  record(who, outcome) {
    this.moves.push({ who, row: outcome.row, col: outcome.col, result: outcome.result, ship: outcome.ship ? outcome.ship.name : null });
    this.stats[who].shots++;
    if (outcome.result !== 'miss') this.stats[who].hits++;
  }

  finish(winner) {
    this.phase = 'over';
    this.winner = winner;
  }
}
