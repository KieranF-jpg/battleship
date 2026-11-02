// Over-the-top pirate theme effects: cannonballs, comic-book booms, a heckling parrot,
// a rope-swinging pirate for victories and a kraken for defeats. Pure decoration.

const SQUAWKS = {
  'player-miss': ['SQUAWK! Fish food!', "Ye hit the water, Cap'n!", 'Polly saw nothin\'!'],
  'player-hit': ['Pieces of eight! Pieces of eight!', 'SQUAWK! Direct hit!', 'Shiver me timbers!'],
  'player-sunk': ['Down she goes! SQUAWK!', "Davy Jones says thank ye!", 'Yo ho ho!'],
  'ai-miss': ["Ha! They couldn't hit a whale!", 'SQUAWK! Missed us!'],
  'ai-hit': ['Man the pumps!', 'SQUAWK! We be holed!', 'Ow! Me feathers!'],
  'ai-sunk': ['Abandon ship! SQUAWK!', 'Polly wants revenge!'],
  win: ['Polly wants a treasure chest!', 'Victory! Rum for everyone!'],
  lose: ['SQUAWK! Every bird for itself!', 'Polly is swimming home...'],
};

const BOOMS = { miss: ['SPLOOSH!', 'KER-SPLASH!'], hit: ['KABOOM!', 'KRAKOOM!'], sunk: ['KER-RACK-A-BOOM!'] };

const pick = (list, rnd = Math.random) => list[Math.floor(rnd() * list.length)];

export function squawk(parrot, event, rnd = Math.random) {
  const line = SQUAWKS[event];
  if (!parrot || !line) return;
  const bubble = parrot.querySelector('.parrot-bubble');
  bubble.textContent = pick(line, rnd);
  parrot.classList.remove('talk');
  void parrot.offsetWidth;
  parrot.classList.add('talk');
}

export function hush(parrot) {
  if (!parrot) return;
  parrot.classList.remove('talk');
  parrot.querySelector('.parrot-bubble').textContent = '';
}

const centre = (el) => {
  const b = el.getBoundingClientRect();
  return [b.left + b.width / 2, b.top + b.height / 2];
};

// Fires a cannonball in an arc from one element to another; resolves when it lands.
export function cannonball(from, to, duration = 450) {
  if (!from || !to) return Promise.resolve();
  const [x0, y0] = centre(from);
  const [x1, y1] = centre(to);
  const arc = Math.max(120, Math.hypot(x1 - x0, y1 - y0) * 0.4);
  const ball = document.createElement('div');
  ball.className = 'cannonball';
  ball.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ball);
  const frames = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - arc * 4 * t * (1 - t);
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 + 0.7 * Math.sin(Math.PI * t)})` });
  }
  return new Promise((resolve) => {
    const done = () => { ball.remove(); resolve(); };
    if (!ball.animate) return done();
    ball.animate(frames, { duration, easing: 'linear' });
    setTimeout(done, duration);
  });
}

export function boom(cell, result) {
  if (!cell || !BOOMS[result]) return;
  const [x, y] = centre(cell);
  const el = document.createElement('span');
  el.className = `boom boom-${result}`;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = pick(BOOMS[result]);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty('--tilt', `${Math.round(Math.random() * 30 - 15)}deg`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

const PIRATE_SVG = `<svg viewBox="0 0 100 150" width="110" height="165" aria-hidden="true">
  <line x1="50" y1="4" x2="47" y2="66" stroke="#f1c27d" stroke-width="7" stroke-linecap="round"/>
  <circle cx="50" cy="5" r="6" fill="#f1c27d"/>
  <line x1="30" y1="72" x2="12" y2="88" stroke="#f1c27d" stroke-width="7" stroke-linecap="round"/>
  <path d="M12 88 Q-6 70 4 48 Q6 68 16 84 Z" fill="#dfe6ee" stroke="#8a96a3" stroke-width="1.5"/>
  <rect x="29" y="64" width="28" height="34" rx="5" fill="#e2463b"/>
  <rect x="29" y="72" width="28" height="5" fill="#fff"/><rect x="29" y="83" width="28" height="5" fill="#fff"/>
  <rect x="29" y="92" width="28" height="6" fill="#222"/><rect x="40" y="92" width="6" height="6" fill="#f2c14e"/>
  <rect x="31" y="98" width="10" height="34" fill="#2b2f5c"/>
  <rect x="35" y="132" width="3" height="16" fill="#8b5a2b"/>
  <rect x="45" y="98" width="10" height="38" fill="#2b2f5c"/>
  <path d="M43 136 h16 v8 h-18 z" fill="#111"/>
  <circle cx="41" cy="50" r="14" fill="#f1c27d"/>
  <path d="M28 54 Q41 82 54 54 Q41 64 28 54 Z" fill="#6b3a1a"/>
  <circle cx="35" cy="47" r="2.2" fill="#111"/>
  <line x1="27" y1="40" x2="55" y2="50" stroke="#111" stroke-width="2"/>
  <circle cx="46" cy="47" r="4.5" fill="#111"/>
  <path d="M20 40 Q41 14 62 40 Q41 32 20 40 Z" fill="#1a1a1a"/>
  <circle cx="41" cy="31" r="3.5" fill="#fff"/>
</svg>`;

// Victory: a pirate swings across the screen on a rope bellowing "ARRRR!".
export function swingingPirate() {
  const layer = document.createElement('div');
  layer.className = 'pirate-swing';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<div class="rope"><div class="swinger"><span class="arr">ARRRR!</span>${PIRATE_SVG}</div></div>`;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3400);
}

const TENTACLE_SVG = `<svg viewBox="0 0 40 200" preserveAspectRatio="none" aria-hidden="true">
  <path d="M8 200 C 0 140, 30 110, 16 62 C 8 32, 22 10, 34 2 C 32 26, 24 42, 28 66 C 36 112, 20 150, 34 200 Z" fill="#7b3fa0"/>
  <g fill="#e7b4f0"><circle cx="24" cy="70" r="2.5"/><circle cx="25" cy="95" r="3"/><circle cx="24" cy="122" r="3.2"/><circle cx="24" cy="150" r="3.5"/><circle cx="25" cy="178" r="3.8"/></g>
</svg>`;

// Defeat: the kraken rises and drags a ship to Davy Jones' locker.
export function kraken() {
  const layer = document.createElement('div');
  layer.className = 'kraken';
  layer.setAttribute('aria-hidden', 'true');
  const spots = [6, 20, 36, 62, 78, 92];
  layer.innerHTML = spots.map((x, i) => `<i class="tentacle" style="left:${x}%;--d:${i * 0.12}s;--flip:${i % 2 ? -1 : 1}">${TENTACLE_SVG}</i>`).join('') +
    '<span class="kraken-ship">⛵</span><span class="kraken-eye">👁️</span>';
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3400);
}
