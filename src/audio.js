let ctx = null;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, dur, { type = 'sine', gain = 0.15, slideTo = null, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, { gain = 0.2, freq = 1200, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

// Looping rotor thump: filtered noise whose level is chopped by a low-frequency oscillator.
let rotor = null;

function rotorSet(volume, rate = 1) {
  if (!ctx) return;
  if (!rotor) {
    if (volume <= 0) return;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 12;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    const master = ctx.createGain();
    master.gain.value = 0;
    src.connect(f).connect(chop).connect(master).connect(ctx.destination);
    src.start();
    lfo.start();
    rotor = { src, lfo, master };
  }
  const now = ctx.currentTime;
  rotor.master.gain.setTargetAtTime(volume, now, 0.15);
  rotor.lfo.frequency.setTargetAtTime(12 * rate, now, 0.15);
  if (volume <= 0) {
    const r = rotor;
    rotor = null;
    r.src.stop(now + 0.8);
    r.lfo.stop(now + 0.8);
  }
}

export const sfx = {
  rotor: rotorSet,
  gun() {
    noise(0.05, { gain: 0.09, freq: 3200 });
    tone(760, 0.05, { type: 'square', gain: 0.035, slideTo: 300 });
  },
  enemyGun() {
    noise(0.06, { gain: 0.1, freq: 1800 });
    tone(360, 0.07, { type: 'sawtooth', gain: 0.045, slideTo: 150 });
  },
  hit() {
    tone(1400, 0.04, { type: 'square', gain: 0.03, slideTo: 700 });
  },
  hurt() {
    noise(0.16, { gain: 0.16, freq: 900 });
    tone(140, 0.2, { type: 'sawtooth', gain: 0.1, slideTo: 60 });
  },
  missile() {
    noise(0.7, { gain: 0.16, freq: 2400 });
    tone(220, 0.6, { type: 'sawtooth', gain: 0.05, slideTo: 520 });
  },
  whistle() {
    tone(1500, 1.05, { type: 'sine', gain: 0.05, slideTo: 420 });
  },
  boom(size = 1) {
    noise(0.7 * size, { gain: 0.34, freq: 700 });
    tone(110, 0.5 * size, { type: 'sine', gain: 0.32, slideTo: 32 });
  },
  hatch() {
    tone(70, 1.2, { type: 'sawtooth', gain: 0.08, slideTo: 45 });
    noise(1.1, { gain: 0.1, freq: 500 });
    [0, 0.5].forEach((d) => tone(1800, 0.06, { type: 'square', gain: 0.03, delay: d }));
  },
  alarm() {
    [0, 0.28].forEach((d) => tone(880, 0.22, { type: 'square', gain: 0.045, slideTo: 620, delay: d }));
  },
  victory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { gain: 0.11, delay: i * 0.11 }));
  },
  putt(power) {
    tone(260 + power * 120, 0.09, { type: 'triangle', gain: 0.1 + power * 0.14, slideTo: 90 });
    noise(0.04, { gain: 0.12, freq: 2500 });
  },
  bump(speed) {
    const g = Math.min(0.18, 0.03 + speed * 0.01);
    tone(180, 0.07, { type: 'square', gain: g, slideTo: 110 });
  },
  moo() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t0);
    o.frequency.linearRampToValueAtTime(105, t0 + 0.55);
    lfo.frequency.value = 7;
    lg.gain.value = 6;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass';
    f.frequency.value = 650;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 0.65);
    lfo.stop(t0 + 0.65);
  },
  baa() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(330, t0);
    o.frequency.linearRampToValueAtTime(250, t0 + 0.5);
    lfo.frequency.value = 26;
    lg.gain.value = 22;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.52);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 0.55);
    lfo.stop(t0 + 0.55);
  },
  // a rugby player grunts when the ball hits him
  oof() {
    tone(210, 0.16, { type: 'sawtooth', gain: 0.07, slideTo: 120 });
    noise(0.1, { gain: 0.06, freq: 600 });
  },
  swing() {
    noise(0.14, { gain: 0.13, freq: 3800 });
    tone(540, 0.12, { type: 'sine', gain: 0.05, slideTo: 200 });
  },
  thud() {
    tone(75, 0.35, { type: 'sine', gain: 0.32, slideTo: 32 });
    noise(0.3, { gain: 0.25, freq: 420 });
  },
  roar() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t0);
    o.frequency.linearRampToValueAtTime(58, t0 + 1.1);
    lfo.frequency.value = 22;
    lg.gain.value = 14;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass';
    f.frequency.value = 520;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 1.25);
    lfo.stop(t0 + 1.25);
    noise(0.9, { gain: 0.12, freq: 700 });
  },
  hug() {
    [523, 659, 784, 1047].forEach((fq, i) => tone(fq, 0.55, { gain: 0.1, delay: i * 0.14 }));
  },
  splash() {
    noise(0.55, { gain: 0.28, freq: 1800 });
    tone(420, 0.25, { type: 'sine', gain: 0.08, slideTo: 140 });
  },
  cup() {
    tone(180, 0.08, { type: 'triangle', gain: 0.18, slideTo: 90 });
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { gain: 0.11, delay: 0.25 + i * 0.1 }));
  },
};
