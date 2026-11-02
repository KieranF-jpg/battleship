// Synthesised sound effects (Web Audio, no audio files). Muting is remembered between visits.
const MUTE_KEY = 'battleship.muted';

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage disabled */ }

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* storage disabled */ }
}

function audio() {
  if (muted) return null;
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function envelope(gain, t, peak, attack, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(t, { duration, filter = 'lowpass', from, to = from, peak = 0.6, attack = 0.005, q = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + duration);
  const g = ctx.createGain();
  envelope(g, t, peak, attack, duration);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + attack + duration + 0.05);
}

function tone(t, { type = 'sine', from, to = from, duration, peak = 0.3, attack = 0.005 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  const g = ctx.createGain();
  envelope(g, t, peak, attack, duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + attack + duration + 0.05);
}

const SOUNDS = {
  place(t) { tone(t, { type: 'triangle', from: 520, to: 380, duration: 0.08, peak: 0.25 }); },
  fire(t) { noise(t, { filter: 'bandpass', from: 2400, to: 300, duration: 0.22, peak: 0.25, q: 2 }); },
  miss(t) {
    noise(t, { from: 1800, to: 300, duration: 0.45, peak: 0.35, attack: 0.02 });
    tone(t, { from: 420, to: 140, duration: 0.18, peak: 0.15 });
  },
  hit(t) {
    noise(t, { from: 1400, to: 120, duration: 0.6, peak: 0.9 });
    tone(t, { from: 110, to: 40, duration: 0.4, peak: 0.6 });
  },
  sunk(t) {
    SOUNDS.hit(t);
    noise(t + 0.15, { from: 600, to: 80, duration: 1.1, peak: 0.6, attack: 0.05 });
    tone(t + 0.1, { type: 'sawtooth', from: 220, to: 45, duration: 1.0, peak: 0.12 });
  },
  win(t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.13, { type: 'triangle', from: f, duration: 0.35, peak: 0.3 }));
  },
  lose(t) {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(t + i * 0.22, { type: 'triangle', from: f, to: f * 0.97, duration: 0.45, peak: 0.28 }));
  },
  achievement(t) {
    tone(t, { type: 'sine', from: 1318.5, duration: 0.25, peak: 0.25 });
    tone(t + 0.1, { type: 'sine', from: 1975.5, duration: 0.4, peak: 0.2 });
  },
};

// Pirate theme: cannon booms, wooden knocks and a sea-shanty fanfare.
const PIRATE = {
  place(t) {
    tone(t, { type: 'triangle', from: 190, to: 120, duration: 0.07, peak: 0.35 });
    noise(t, { filter: 'bandpass', from: 900, duration: 0.05, peak: 0.2, q: 4 });
  },
  fire(t) {
    noise(t, { from: 900, to: 60, duration: 0.55, peak: 0.8 });
    tone(t, { from: 80, to: 32, duration: 0.4, peak: 0.7 });
  },
  miss(t) {
    noise(t + 0.08, { from: 2600, to: 220, duration: 0.7, peak: 0.4, attack: 0.03 });
    tone(t + 0.08, { from: 360, to: 110, duration: 0.25, peak: 0.12 });
  },
  hit(t) {
    noise(t, { from: 1200, to: 90, duration: 0.7, peak: 0.9 });
    noise(t + 0.05, { filter: 'bandpass', from: 1600, to: 500, duration: 0.25, peak: 0.35, q: 6 });
  },
  sunk(t) {
    PIRATE.hit(t);
    tone(t + 0.15, { type: 'sawtooth', from: 160, to: 70, duration: 1.2, peak: 0.08, attack: 0.2 });
    noise(t + 0.3, { from: 500, to: 60, duration: 1.4, peak: 0.5, attack: 0.1 });
  },
  win(t) {
    [587.33, 739.99, 880, 739.99, 880, 1174.66].forEach((f, i) => tone(t + i * 0.12, { type: 'square', from: f, duration: 0.18, peak: 0.12 }));
  },
  sonar(t) {
    [0, 0.35, 0.7].forEach((d, i) => tone(t + d, { from: 1320, to: 1250, duration: 0.5, peak: 0.18 / (i + 1) }));
  },
  squawk(t) {
    tone(t, { type: 'sawtooth', from: 1500, to: 2400, duration: 0.07, peak: 0.12 });
    tone(t + 0.08, { type: 'sawtooth', from: 2200, to: 1300, duration: 0.11, peak: 0.12 });
    noise(t, { filter: 'bandpass', from: 3200, duration: 0.15, peak: 0.08, q: 3 });
  },
  lose(t) {
    [440, 415.3, 392, 293.66].forEach((f, i) => tone(t + i * 0.3, { type: 'sawtooth', from: f, to: f * 0.96, duration: 0.5, peak: 0.1 }));
  },
};

let variant = SOUNDS;
export function setVariant(name) {
  variant = name === 'pirate' ? { ...SOUNDS, ...PIRATE } : SOUNDS;
}

export function play(name, delay = 0) {
  // Sound is decoration: an audio failure must never interrupt the game.
  try {
    const ac = audio();
    if (!ac || !variant[name]) return;
    variant[name](ac.currentTime + delay);
  } catch { /* audio unavailable */ }
}

// A gravelly pirate voice via the browser's speech synthesis, where available.
export function say(text) {
  if (muted) return;
  try {
    const speech = globalThis.speechSynthesis;
    if (!speech || !globalThis.SpeechSynthesisUtterance) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.3;
    u.rate = 0.85;
    speech.cancel();
    speech.speak(u);
  } catch { /* speech unavailable */ }
}
