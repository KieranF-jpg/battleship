import { BOARD_SIZE, FLEET, HORIZONTAL, VERTICAL, key, shipCells } from './game.js';

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export const DIFFICULTIES = Object.freeze({
  easy: 'Easy — fires at random',
  medium: 'Medium — hunts, then targets hits',
  hard: 'Hard — probability-based targeting',
});

export class AI {
  constructor({ difficulty = 'hard', rng = Math.random, size = BOARD_SIZE, fleet = FLEET } = {}) {
    if (!(difficulty in DIFFICULTIES)) throw new Error(`Unknown difficulty: ${difficulty}`);
    this.difficulty = difficulty;
    this.rng = rng;
    this.size = size;
    this.state = new Map();
    this.remaining = fleet.map((s) => s.size);
  }

  inBounds(r, c) {
    return r >= 0 && c >= 0 && r < this.size && c < this.size;
  }

  stateAt(r, c) {
    return this.state.get(key(r, c));
  }

  unshotCells() {
    const cells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.state.has(key(r, c))) cells.push([r, c]);
      }
    }
    return cells;
  }

  unresolvedHits() {
    const hits = [];
    for (const [k, v] of this.state) {
      if (v === 'hit') hits.push(k.split(',').map(Number));
    }
    return hits;
  }

  pick(cells) {
    return cells[Math.floor(this.rng() * cells.length)];
  }

  chooseShot() {
    const open = this.unshotCells();
    if (open.length === 0) throw new Error('No cells left to fire at');
    if (this.difficulty === 'easy') return this.pick(open);
    if (this.difficulty === 'medium') return this.chooseMedium(open);
    return this.chooseHard(open);
  }

  chooseMedium(open) {
    const hits = this.unresolvedHits();
    if (hits.length > 0) {
      const lineTargets = this.lineTargets(hits);
      if (lineTargets.length > 0) return this.pick(lineTargets);
      const neighbours = [];
      for (const [r, c] of hits) {
        for (const [dr, dc] of DIRECTIONS) {
          const nr = r + dr, nc = c + dc;
          if (this.inBounds(nr, nc) && !this.state.has(key(nr, nc))) neighbours.push([nr, nc]);
        }
      }
      if (neighbours.length > 0) return this.pick(neighbours);
    }
    const minShip = Math.min(...this.remaining);
    const parity = open.filter(([r, c]) => (r + c) % minShip === 0);
    return this.pick(parity.length > 0 ? parity : open);
  }

  lineTargets(hits) {
    const targets = [];
    const hitSet = new Set(hits.map(([r, c]) => key(r, c)));
    for (const [r, c] of hits) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!hitSet.has(key(r + dr, c + dc))) continue;
        let er = r, ec = c;
        while (hitSet.has(key(er + dr, ec + dc))) { er += dr; ec += dc; }
        let sr = r, sc = c;
        while (hitSet.has(key(sr - dr, sc - dc))) { sr -= dr; sc -= dc; }
        for (const [tr, tc] of [[er + dr, ec + dc], [sr - dr, sc - dc]]) {
          if (this.inBounds(tr, tc) && !this.state.has(key(tr, tc))) targets.push([tr, tc]);
        }
      }
    }
    return targets;
  }

  chooseHard(open) {
    const hits = this.unresolvedHits();
    const targeting = hits.length > 0;
    const scores = new Map();
    for (const size of this.remaining) {
      for (const orientation of [HORIZONTAL, VERTICAL]) {
        for (let r = 0; r < this.size; r++) {
          for (let c = 0; c < this.size; c++) {
            const cells = shipCells(r, c, size, orientation);
            let covered = 0;
            let valid = true;
            for (const [cr, cc] of cells) {
              const s = this.stateAt(cr, cc);
              if (!this.inBounds(cr, cc) || s === 'miss' || s === 'sunk') { valid = false; break; }
              if (s === 'hit') covered++;
            }
            if (!valid || (targeting && covered === 0)) continue;
            const weight = targeting ? Math.pow(20, covered) : 1;
            for (const [cr, cc] of cells) {
              if (this.stateAt(cr, cc) === undefined) {
                const k = key(cr, cc);
                scores.set(k, (scores.get(k) || 0) + weight);
              }
            }
          }
        }
      }
    }
    if (scores.size === 0) return this.chooseMedium(open);
    let best = -1;
    let bestCells = [];
    for (const [k, score] of scores) {
      if (score > best) { best = score; bestCells = [k]; }
      else if (score === best) bestCells.push(k);
    }
    return this.pick(bestCells).split(',').map(Number);
  }

  recordResult(outcome) {
    const { row, col, result } = outcome;
    this.state.set(key(row, col), result === 'miss' ? 'miss' : 'hit');
    if (result === 'sunk') {
      for (const [r, c] of outcome.ship.cells) this.state.set(key(r, c), 'sunk');
      const idx = this.remaining.indexOf(outcome.ship.size);
      if (idx !== -1) this.remaining.splice(idx, 1);
    }
  }
}

