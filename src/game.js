export const BOARD_SIZE = 10;

export const FLEET = Object.freeze([
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
]);

export const BROADSIDE_LENGTH = 3;
export const POWERUP_CHARGES = Object.freeze({ sonar: 1, broadside: 1 });

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
    this.decoy = null;
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
    this.decoy = null;
  }

  isDecoy(row, col) {
    return Boolean(this.decoy) && this.decoy[0] === row && this.decoy[1] === col;
  }

  // Hides a one-square decoy on open water; it shows up on sonar but sinks nothing.
  placeDecoy(rng = Math.random) {
    const open = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) if (!this.shipAt(r, c)) open.push([r, c]);
    }
    this.decoy = open[Math.floor(rng() * open.length)];
  }

  // Number of unhit ship squares (and an unshot decoy) in the 3x3 area centred on a square.
  sonar(row, col) {
    let count = 0;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (!this.inBounds(r, c)) continue;
        if (this.shipAt(r, c) && !this.isShot(r, c)) count++;
        else if (this.isDecoy(r, c) && !this.isShot(r, c)) count++;
      }
    }
    return count;
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
    if (!ship && this.isDecoy(row, col)) {
      this.shots.set(key(row, col), 'decoy');
      return { result: 'decoy', row, col };
    }
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
  constructor({ ai, rng = Math.random, powerups = false } = {}) {
    this.rng = rng;
    this.ai = ai;
    this.powerups = powerups;
    const charges = () => (powerups ? { ...POWERUP_CHARGES } : { sonar: 0, broadside: 0 });
    this.charges = { player: charges(), ai: charges() };
    // The player's actions in order: [row, col], [row, col, 'sonar'] or [row, col, 'broadside', orientation].
    this.actions = [];
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
    if (this.powerups) {
      this.enemy.placeDecoy(this.rng);
      this.player.placeDecoy(this.rng);
    }
    this.phase = 'playing';
    this.turn = 'player';
  }

  canAct(who) {
    return this.phase === 'playing' && this.turn === who;
  }

  targetOf(who) {
    return who === 'player' ? this.enemy : this.player;
  }

  passTurn(who) {
    if (this.phase === 'playing') this.turn = who === 'player' ? 'ai' : 'player';
  }

  shoot(who, row, col) {
    const board = this.targetOf(who);
    const outcome = board.receiveShot(row, col);
    if (who === 'ai') this.ai.recordResult(outcome);
    this.record(who, outcome);
    if (board.allSunk()) this.finish(who);
    return outcome;
  }

  sonar(who, row, col) {
    const board = this.targetOf(who);
    if (!this.charges[who].sonar || !board.inBounds(row, col)) return null;
    this.charges[who].sonar--;
    const count = board.sonar(row, col);
    this.moves.push({ who, row, col, result: 'sonar', count, ship: null });
    if (who === 'ai') this.ai.recordSonar(row, col, count);
    return { result: 'sonar', row, col, count };
  }

  // Up to three shots in a line from (row, col); squares already shot or off the board are skipped.
  // `limit` stops the volley early, so a replay can show it shot by shot.
  broadside(who, row, col, orientation, limit = Infinity) {
    const board = this.targetOf(who);
    if (!this.charges[who].broadside || (orientation !== HORIZONTAL && orientation !== VERTICAL)) return null;
    const cells = shipCells(row, col, BROADSIDE_LENGTH, orientation).filter(([r, c]) => board.inBounds(r, c) && !board.isShot(r, c));
    if (cells.length === 0) return null;
    this.charges[who].broadside--;
    const outcomes = [];
    for (const [r, c] of cells) {
      if (this.phase !== 'playing' || outcomes.length >= limit) break;
      outcomes.push(this.shoot(who, r, c));
      this.moves[this.moves.length - 1].power = 'broadside';
    }
    return { result: 'broadside', row, col, orientation, outcomes };
  }

  playerFire(row, col) {
    if (!this.canAct('player')) return null;
    if (!this.enemy.inBounds(row, col) || this.enemy.isShot(row, col)) return null;
    const outcome = this.shoot('player', row, col);
    this.actions.push([row, col]);
    this.passTurn('player');
    return outcome;
  }

  playerSonar(row, col) {
    if (!this.canAct('player')) return null;
    const outcome = this.sonar('player', row, col);
    if (!outcome) return null;
    this.actions.push([row, col, 'sonar']);
    this.passTurn('player');
    return outcome;
  }

  playerBroadside(row, col, orientation, limit = Infinity) {
    if (!this.canAct('player')) return null;
    const outcome = this.broadside('player', row, col, orientation, limit);
    if (!outcome) return null;
    this.actions.push([row, col, 'broadside', orientation]);
    this.passTurn('player');
    return outcome;
  }

  aiFire(limit = Infinity) {
    if (!this.canAct('ai')) return null;
    const power = this.powerups ? this.ai.choosePower(this.charges.ai) : null;
    let outcome = null;
    if (power?.type === 'sonar') outcome = this.sonar('ai', power.row, power.col);
    if (power?.type === 'broadside') outcome = this.broadside('ai', power.row, power.col, power.orientation, limit);
    if (!outcome) {
      const [row, col] = this.ai.chooseShot();
      outcome = this.shoot('ai', row, col);
    }
    this.passTurn('ai');
    return outcome;
  }

  record(who, outcome) {
    this.moves.push({ who, row: outcome.row, col: outcome.col, result: outcome.result, ship: outcome.ship ? outcome.ship.name : null });
    this.stats[who].shots++;
    if (outcome.result === 'hit' || outcome.result === 'sunk') this.stats[who].hits++;
  }

  finish(winner) {
    this.phase = 'over';
    this.winner = winner;
  }
}
