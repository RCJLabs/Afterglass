// The season's sounds, made as they play with Web Audio: no sound files, so nothing to download or cache.
// The sim names what happened (cue() in sim.js) and the page adds a few of its own; each name here has a
// sound, a label for Settings, how often at most it plays, and a vibration for phones that allow one.
// Bells ring for the phases and the dead, glass for the mirrors and the Veil; the Unlit hiss, growl and
// crack. Under each phase lies a bed of sound: wind on the lake by day, a drone in the Tain at night, a slow
// chord at dusk and at the rite. Phone speakers lose almost everything below 200 Hz, so every sound also
// has something higher; the booms are for headphones.
//
// Levels were set by rendering each sound offline and measuring it, not by ear.

/* ---------------------------------------------------------------- building blocks */

// Everything one sound makes goes through a voice: its level, where it sits left to right, and how much of
// it goes to the reverb. The voice is disconnected once its last part has stopped.
function voice(A, t, { gain = 1, pan = 0, wet = 0.3, bed = false } = {}) {
  const { ctx } = A;
  const out = ctx.createGain();
  out.gain.value = gain;
  const nodes = [out];
  let tail = out;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p);
    tail = p;
    nodes.push(p);
  }
  tail.connect(bed ? A.ambDry : A.fxDry);
  if (wet > 0) {
    const w = ctx.createGain();
    w.gain.value = wet;
    tail.connect(w);
    w.connect(bed ? A.ambWet : A.fxWet);
    nodes.push(w);
  }
  return { A, ctx, t, out, end: t, done: () => nodes.forEach((n) => n.disconnect()) };
}

// A level that rises in `a` seconds to `peak`, holds for `hold`, then dies away with time constant `tau`.
// Returns the gain node and when it's silent (seven time constants: -60 dB).
function env(V, t, { a = 0.003, peak = 1, hold = 0, tau = 0.25 } = {}) {
  const g = V.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(0, t + a + hold, tau);
  const end = t + a + hold + tau * 7;
  V.end = Math.max(V.end, end);
  return [g, end];
}

// An oscillator with an envelope. glide: [to Hz, over s]; vib: [rate Hz, depth Hz]; lp: [Hz, Q].
function tone(V, t, f, o = {}) {
  const { ctx } = V;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide[0], t + o.glide[1]);
  const [g, end] = env(V, t, o);
  if (o.vib) {
    const l = ctx.createOscillator();
    const d = ctx.createGain();
    l.frequency.value = o.vib[0];
    d.gain.value = o.vib[1];
    l.connect(d);
    d.connect(osc.frequency);
    l.start(t);
    l.stop(end);
  }
  let head = osc;
  if (o.lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = o.lp[0];
    fl.Q.value = o.lp[1] ?? 0.7;
    osc.connect(fl);
    head = fl;
  }
  head.connect(g);
  g.connect(o.to || V.out);
  osc.start(t);
  osc.stop(end);
}

// Filtered noise with an envelope: a filter type and centre (f, q), and a sweep: [to Hz, over s].
function hiss(V, t, o = {}) {
  const { ctx, A } = V;
  const src = ctx.createBufferSource();
  src.buffer = A.noise;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type || 'bandpass';
  fl.frequency.setValueAtTime(o.f || 1000, t);
  if (o.sweep) fl.frequency.exponentialRampToValueAtTime(o.sweep[0], t + o.sweep[1]);
  fl.Q.value = o.q ?? 1;
  const [g, end] = env(V, t, o);
  src.connect(fl);
  fl.connect(g);
  g.connect(o.to || V.out);
  src.start(t, A.rand() * 1.5);
  src.stop(end);
}

// A wobble in level (a growl's rasp, a whisper's breath) for whatever is sent to the node it returns.
function wobble(V, t, end, rate, depth) {
  const { ctx } = V;
  const g = ctx.createGain();
  g.gain.value = 1 - depth;
  const l = ctx.createOscillator();
  const d = ctx.createGain();
  l.frequency.value = rate;
  d.gain.value = depth;
  l.connect(d);
  d.connect(g.gain);
  l.start(t);
  l.stop(end);
  g.connect(V.out);
  return g;
}

// A tuned bell's partials (hum, prime, tierce, quint, nominal and above), each beating against a twin a
// little sharp, and the clapper's strike.
const BELL = [[0.5, 0.4, 1.5], [1, 0.8, 1], [1.2, 0.5, 0.75], [1.5, 0.32, 0.6], [2, 0.42, 0.5], [2.5, 0.18, 0.35], [3, 0.14, 0.28], [4.2, 0.08, 0.2]];
function bell(V, t, f, { peak = 1, tau = 1.2 } = {}) {
  for (const [r, a, d] of BELL) {
    tone(V, t, f * r, { peak: peak * a * 0.26, tau: tau * d, a: 0.002 });
    tone(V, t, f * r * 1.003, { peak: peak * a * 0.1, tau: tau * d * 0.8, a: 0.002 });
  }
  hiss(V, t, { f: Math.min(8000, f * 4), q: 1.5, peak: peak * 0.3, a: 0.001, tau: 0.01 });
}
// Struck glass: partials far apart, the high ones dying fast.
function glass(V, t, f, { peak = 1, tau = 0.5 } = {}) {
  tone(V, t, f, { peak: peak * 0.5, tau, a: 0.003 });
  tone(V, t, f * 1.004, { peak: peak * 0.2, tau: tau * 0.9, a: 0.003 });
  tone(V, t, f * 2.76, { peak: peak * 0.2, tau: tau * 0.45, a: 0.002 });
  tone(V, t, f * 5.4, { peak: peak * 0.08, tau: tau * 0.2, a: 0.001 });
}
// Metal on metal.
function clash(V, t, { peak = 1, f = 1250 } = {}) {
  for (const [r, a, d] of [[1, 0.35, 0.3], [1.47, 0.3, 0.22], [2.09, 0.25, 0.18], [2.56, 0.18, 0.14], [3.12, 0.12, 0.1]]) tone(V, t, f * r, { peak: peak * a, tau: d, a: 0.001 });
  hiss(V, t, { type: 'highpass', f: 2500, q: 0.7, peak: peak * 0.6, a: 0.001, tau: 0.04 });
}
// A deep blow, with an overtone a phone can play.
function boom(V, t, { peak = 1, f = 70, to = 38, tau = 0.35 } = {}) {
  tone(V, t, f, { glide: [to, tau * 2], peak, tau, a: 0.004 });
  tone(V, t, f * 3.02, { glide: [to * 3, tau * 2], peak: peak * 0.25, tau: tau * 0.5, a: 0.004 });
}
// Wood or stone, knocked.
function knock(V, t, { peak = 1, f = 900, low = 180 } = {}) {
  hiss(V, t, { f, q: 3, peak: peak * 0.8, a: 0.001, tau: 0.03 });
  tone(V, t, low, { glide: [low * 0.8, 0.08], peak: peak * 0.7, tau: 0.05, a: 0.001 });
}
// Glass splitting: one sharp crack, then a run of small ones.
function crackle(V, t, { peak = 1, n = 8, span = 0.18 } = {}) {
  const r = V.A.rand;
  hiss(V, t, { type: 'highpass', f: 3000, q: 0.7, peak, a: 0.0005, tau: 0.008 });
  for (let i = 0; i < n; i++) hiss(V, t + 0.01 + r() * span, { f: 2500 + r() * 4000, q: 4, peak: peak * (0.3 + 0.4 * r()), a: 0.0005, tau: 0.006 + r() * 0.01 });
}
// The Unlit's growl: two low saws a little apart, rasping, with some grit.
function growl(V, t, { peak = 1, f = 46, hold = 1, tau = 0.3, rate = 11 } = {}) {
  const end = t + 0.3 + hold + tau * 7;
  const to = wobble(V, t, end, rate, 0.55);
  tone(V, t, f, { type: 'sawtooth', lp: [1200, 4], peak: peak * 0.35, a: 0.3, hold, tau, to });
  tone(V, t, f * 1.055, { type: 'sawtooth', lp: [1200, 4], peak: peak * 0.3, a: 0.3, hold, tau, to });
  tone(V, t, f * 4.02, { type: 'sawtooth', lp: [1400, 2], peak: peak * 0.12, a: 0.3, hold, tau, to });
  hiss(V, t, { f: 650, q: 2, peak: peak * 0.8, a: 0.3, hold, tau, to });
}

/* ---------------------------------------------------------------- the sounds */

// group: how loud it sits (alarm, event, small); every: at most one per so many ms; gain: the trim that
// brings it to its group's level (measured); wet: how much reverb; haptic: a vibration pattern in ms.
const G = { alarm: { every: 600 }, event: { every: 300 }, small: { every: 80 } };
const def = (group, o) => ({ group, every: G[group].every, gain: 1, wet: 0.35, haptic: null, ...o });

export const SOUNDS = {
  // The phases.
  day: def('event', { label: 'A new day', play(V, t) {
    bell(V, t, 523.25, { tau: 1.1 });
    glass(V, t + 0.04, 2093, { peak: 0.2, tau: 0.4 });
  } }),
  dusk: def('event', { label: 'Dusk', wet: 0.45, play(V, t) {
    bell(V, t, 392, { tau: 1.5 });
    bell(V, t + 0.75, 293.66, { tau: 1.8, peak: 0.85 });
  } }),
  night: def('event', { label: 'The night begins: down into the Tain', wet: 0.6, play(V, t) {
    hiss(V, t, { f: 2400, sweep: [350, 0.9], q: 2, peak: 0.3, a: 0.85, tau: 0.08 });
    tone(V, t, 440, { a: 0.85, peak: 0.1, tau: 0.08 });
    tone(V, t, 659.25, { a: 0.85, peak: 0.08, tau: 0.08 });
    bell(V, t + 0.9, 130.81, { tau: 2.2 });
    glass(V, t + 0.9, 880, { peak: 0.4, tau: 1 });
  } }),
  dawn: def('event', { label: 'Dawn', wet: 0.55, play(V, t) {
    [659.25, 880, 1108.73, 1318.51].forEach((f, i) => glass(V, t + i * 0.09, f, { peak: 0.45, tau: 0.7 }));
    bell(V, t + 0.3, 440, { tau: 1.2, peak: 0.6 });
  } }),
  end: def('event', { label: 'The season is over', wet: 0.5, play(V, t) {
    for (const f of [220, 277.18, 329.63, 440]) tone(V, t, f, { peak: 0.14, a: 0.4, hold: 1.4, tau: 0.6 });
    bell(V, t + 0.2, 440, { tau: 1.6, peak: 0.8 });
  } }),
  over: def('alarm', { label: 'The keep is lost', wet: 0.5, haptic: [200, 100, 300], play(V, t) {
    for (let i = 0; i < 3; i++) bell(V, t + i * 1.1, 146.83, { tau: 2, peak: 1 - i * 0.2 });
    for (const f of [196, 233.08, 293.66]) tone(V, t, f, { type: 'triangle', lp: [900], peak: 0.12, a: 1.2, hold: 1.5, tau: 0.9 });
  } }),

  // Raids by day.
  horn: def('alarm', { label: 'Raiders on the road', haptic: [70, 70, 70], play(V, t) {
    for (const [f, at, hold] of [[146.83, 0, 0.7], [196, 0.95, 1]]) {
      for (const [m, p] of [[1, 0.4], [1.004, 0.35], [0.5, 0.2]]) {
        tone(V, t + at, f * m * 0.97, { type: m === 0.5 ? 'square' : 'sawtooth', glide: [f * m, 0.08], lp: [1100, 1.5], peak: p, a: 0.09, hold, tau: 0.12 });
      }
    }
  } }),
  held: def('event', { label: 'The gate held', play(V, t) {
    clash(V, t, { peak: 0.6 });
    tone(V, t + 0.2, 293.66, { type: 'triangle', peak: 0.4, a: 0.01, hold: 0.15, tau: 0.1 });
    tone(V, t + 0.42, 440, { type: 'triangle', peak: 0.45, a: 0.01, hold: 0.35, tau: 0.25 });
  } }),
  breached: def('alarm', { label: 'The raiders broke through', haptic: [120, 60, 160], play(V, t) {
    boom(V, t, { peak: 0.45, f: 70, to: 35, tau: 0.4 });
    hiss(V, t, { type: 'lowpass', f: 1800, peak: 0.6, a: 0.002, tau: 0.25 });
    clash(V, t + 0.05, { peak: 0.5 });
    clash(V, t + 0.18, { peak: 0.4, f: 1100 });
    tone(V, t + 0.3, 220, { type: 'sawtooth', glide: [174.61, 0.5], lp: [900], peak: 0.3, a: 0.05, hold: 0.4, tau: 0.2 });
  } }),

  // The living and the dead.
  knell: def('event', { label: 'One of the living has died', wet: 0.5, haptic: [40, 60, 40], play(V, t) {
    bell(V, t, 196, { tau: 2 });
    tone(V, t + 0.02, 466.16, { type: 'triangle', peak: 0.08, a: 0.3, tau: 0.8 });
  } }),
  rest: def('event', { label: 'Laid to rest, or released', every: 500, wet: 0.55, play(V, t) {
    bell(V, t, 293.66, { tau: 1.3, peak: 0.7 });
    glass(V, t + 0.05, 1174.66, { peak: 0.2, tau: 0.8 });
  } }),
  wake: def('event', { label: 'A shade wakes in a mirror', every: 400, wet: 0.6, play(V, t) {
    [880, 1318.51, 1760].forEach((f, i) => glass(V, t + i * 0.11, f, { peak: 0.5, tau: 0.6 }));
    hiss(V, t, { type: 'highpass', f: 4000, peak: 0.12, a: 0.25, tau: 0.1 });
  } }),
  restless: def('event', { label: 'A shade wakes Restless', every: 600, wet: 0.6, play(V, t) {
    tone(V, t, 330, { glide: [311.13, 1], vib: [5, 8], peak: 0.4, a: 0.2, hold: 0.6, tau: 0.3 });
    hiss(V, t, { f: 900, q: 3, peak: 0.25, a: 0.3, hold: 0.3, tau: 0.3 });
  } }),
  wraith: def('event', { label: 'A Wraith rises', wet: 0.6, play(V, t) {
    tone(V, t, 220, { type: 'sawtooth', glide: [164.81, 1.4], vib: [4, 6], lp: [900], peak: 0.3, a: 0.25, hold: 0.9, tau: 0.4 });
    tone(V, t, 233.08, { glide: [174.61, 1.4], peak: 0.2, a: 0.25, hold: 0.9, tau: 0.4 });
    hiss(V, t, { f: 1200, q: 4, sweep: [500, 1.4], peak: 0.25, a: 0.4, hold: 0.6, tau: 0.3 });
  } }),
  fade: def('event', { label: 'A shade is lost for good', every: 400, wet: 0.7, haptic: [30, 40, 30], play(V, t) {
    [1318.51, 1046.5, 880, 698.46].forEach((f, i) => glass(V, t + i * 0.13, f, { peak: 0.5 - i * 0.08, tau: 0.5 + i * 0.1 }));
  } }),
  banish: def('event', { label: 'A shade is banished', play(V, t) {
    hiss(V, t, { type: 'lowpass', f: 2200, sweep: [160, 0.8], q: 2, peak: 0.6, a: 0.05, hold: 0.4, tau: 0.25 });
    tone(V, t, 220, { glide: [55, 0.8], type: 'triangle', peak: 0.4, a: 0.02, hold: 0.4, tau: 0.25 });
  } }),

  // The night: the player's hand.
  light: def('small', { label: 'A candle is set', every: 60, haptic: [8], play(V, t) {
    hiss(V, t, { f: 400, sweep: [2600, 0.07], q: 1.5, peak: 0.7, a: 0.03, tau: 0.06 });
    tone(V, t + 0.04, 1760, { peak: 0.12, tau: 0.08 });
  } }),
  post: def('small', { label: 'A shade is posted', every: 60, haptic: [6], play(V, t) {
    tone(V, t, 1396.91, { peak: 0.4, tau: 0.05 });
    tone(V, t, 2793.83, { peak: 0.12, tau: 0.03 });
  } }),
  ward: def('event', { label: 'A ward is set', wet: 0.55, haptic: [15], play(V, t) {
    for (const f of [659.25, 987.77]) {
      tone(V, t, f, { peak: 0.3, tau: 0.9 });
      tone(V, t, f * 1.003, { peak: 0.12, tau: 0.8 });
    }
    hiss(V, t, { type: 'highpass', f: 6000, peak: 0.15, a: 0.002, tau: 0.1 });
  } }),
  hush: def('event', { label: 'Hush', wet: 0.6, play(V, t) {
    hiss(V, t, { f: 5000, q: 1, peak: 0.45, a: 0.08, hold: 0.25, tau: 0.3 });
    tone(V, t, 392, { glide: [196, 0.6], peak: 0.15, a: 0.05, tau: 0.3 });
  } }),
  unhush: def('small', { label: 'The hush ends', wet: 0.5, play(V, t) {
    glass(V, t, 1046.5, { peak: 0.4, tau: 0.3 });
    glass(V, t + 0.09, 1567.98, { peak: 0.4, tau: 0.4 });
  } }),
  nope: def('small', { label: "That can't be done", every: 150, wet: 0.1, haptic: [12, 40, 12], play(V, t) {
    tone(V, t, 293.66, { type: 'triangle', glide: [246.94, 0.08], lp: [1200], peak: 0.7, a: 0.004, tau: 0.07 });
  } }),

  // The night: the Unlit.
  seep: def('small', { label: 'The Unlit seep up in a dark room', every: 500, wet: 0.5, play(V, t) {
    const to = wobble(V, t, t + 2, 9, 0.6);
    hiss(V, t, { f: 500, sweep: [900, 0.5], q: 4, peak: 0.7, a: 0.15, hold: 0.3, tau: 0.15, to });
  } }),
  'foe-down': def('small', { label: 'A Creeper is cut down', every: 110, wet: 0.2, play(V, t) {
    hiss(V, t, { type: 'lowpass', f: 2200, sweep: [450, 0.1], peak: 0.7, a: 0.002, tau: 0.07 });
    tone(V, t, 280, { glide: [130, 0.1], type: 'triangle', peak: 0.35, tau: 0.06 });
  } }),
  snuff: def('small', { label: 'A candle goes out', every: 150, wet: 0.25, play(V, t) {
    hiss(V, t, { f: 2500, sweep: [400, 0.2], q: 2, peak: 0.6, a: 0.01, tau: 0.1 });
    hiss(V, t, { type: 'highpass', f: 5000, peak: 0.12, a: 0.002, tau: 0.04 });
  } }),
  caught: def('alarm', { label: 'A shade is caught in the dark', every: 700, wet: 0.5, haptic: [30, 30, 30], play(V, t) {
    const to = wobble(V, t, t + 3, 12, 0.5);
    tone(V, t, 1046.5, { peak: 0.35, a: 0.005, tau: 0.8, to });
    tone(V, t, 1108.73, { peak: 0.35, a: 0.005, tau: 0.8, to });
    tone(V, t, 130.81, { type: 'triangle', peak: 0.4, tau: 0.3 });
    hiss(V, t, { f: 3000, q: 1, peak: 0.2, a: 0.005, tau: 0.2 });
  } }),
  crack: def('alarm', { label: 'The Veil cracks', wet: 0.5, haptic: [90, 50, 140], play(V, t) {
    crackle(V, t);
    for (const [f, a, d] of [[1318.51, 0.3, 0.5], [3637, 0.12, 0.3], [7118, 0.05, 0.15]]) tone(V, t, f, { peak: a, tau: d, a: 0.001 });
    boom(V, t, { peak: 0.35, f: 65, to: 40, tau: 0.35 });
  } }),
  'ward-break': def('event', { label: 'The Hollow breaks a ward', wet: 0.45, haptic: [50], play(V, t) {
    crackle(V, t, { peak: 0.6, n: 5, span: 0.1 });
    tone(V, t + 0.05, 987.77, { glide: [659.25, 0.25], peak: 0.3, tau: 0.3 });
  } }),

  // The night: Maws.
  maw: def('alarm', { label: 'A Maw rises', haptic: [50, 40, 50], play(V, t) {
    growl(V, t, { hold: 1.1 });
    boom(V, t, { peak: 0.3, f: 45, to: 32, tau: 0.5 });
  } }),
  smash: def('event', { label: 'A Maw tears down a candle', every: 500, wet: 0.3, play(V, t) {
    for (let i = 0; i < 3; i++) hiss(V, t + i * 0.07, { f: 1500, q: 1, peak: 0.6, a: 0.001, tau: 0.08 });
    hiss(V, t + 0.25, { f: 2500, sweep: [400, 0.2], q: 2, peak: 0.4, a: 0.01, tau: 0.1 });
  } }),
  breaking: def('event', { label: 'A Maw is breaking a room', every: 800, wet: 0.3, play(V, t) {
    const to = wobble(V, t, t + 3, 6, 0.6);
    hiss(V, t, { type: 'lowpass', f: 1000, peak: 0.8, a: 0.1, hold: 0.8, tau: 0.25, to });
    growl(V, t, { hold: 0.4, peak: 0.6 });
  } }),
  broken: def('alarm', { label: 'A room is broken', haptic: [100, 40, 100], play(V, t) {
    const r = V.A.rand;
    for (let i = 0; i < 8; i++) hiss(V, t + i * 0.11 + r() * 0.05, { type: 'lowpass', f: 800 + r() * 1400, peak: 0.7 - i * 0.07, a: 0.002, tau: 0.05 + r() * 0.07 });
    for (let i = 0; i < 6; i++) hiss(V, t + 0.2 + r() * 0.7, { f: 3000, q: 5, peak: 0.25, a: 0.0005, tau: 0.01 });
    boom(V, t, { peak: 0.35, f: 60, to: 35, tau: 0.4 });
  } }),
  'maw-down': def('event', { label: 'A Maw is cut down', play(V, t) {
    boom(V, t, { peak: 0.4, f: 80, to: 40, tau: 0.3 });
    hiss(V, t, { type: 'lowpass', f: 1400, peak: 0.6, a: 0.002, tau: 0.2 });
    tone(V, t + 0.05, 160, { type: 'sawtooth', glide: [50, 0.6], lp: [1100, 2], peak: 0.4, a: 0.02, hold: 0.2, tau: 0.2 });
  } }),

  // The night: the Hollow.
  hollow: def('alarm', { label: 'The Hollow rises', wet: 0.55, haptic: [30, 80, 30, 80, 200], play(V, t) {
    boom(V, t, { peak: 0.5, f: 40, to: 28, tau: 1 });
    for (const f of [110, 116.54, 155.56, 220, 233.08, 311.13]) tone(V, t, f, { type: 'sawtooth', lp: [1000, 1], peak: f > 200 ? 0.12 : 0.15, a: 1.5, hold: 1, tau: 0.6 });
    hiss(V, t, { f: 300, sweep: [1800, 2.4], q: 3, peak: 0.5, a: 2.2, tau: 0.15 });
    bell(V, t + 2.4, 146.83, { tau: 1.8, peak: 0.8 });
  } }),
  heartbeat: def('event', { label: 'The Hollow walks (faster as it nears the mirrors)', every: 250, wet: 0.15, haptic: [15], play(V, t) {
    for (const [at, p] of [[0, 1], [0.28, 0.7]]) {
      tone(V, t + at, 75, { glide: [52, 0.12], peak: p * 0.5, tau: 0.08 });
      tone(V, t + at, 190, { type: 'triangle', glide: [120, 0.12], peak: p * 0.5, tau: 0.06 });
      tone(V, t + at, 380, { glide: [260, 0.1], peak: p * 0.2, tau: 0.04 });
      hiss(V, t + at, { type: 'lowpass', f: 1100, peak: p * 0.5, a: 0.002, tau: 0.04 });
    }
  } }),
  torn: def('alarm', { label: 'The Hollow tears through the Veil', wet: 0.6, haptic: [150, 60, 250], play(V, t) {
    crackle(V, t, { peak: 0.6, n: 12, span: 0.3 });
    crackle(V, t + 0.35, { peak: 0.5, n: 8, span: 0.25 });
    boom(V, t, { peak: 0.45, f: 55, to: 30, tau: 0.8 });
    for (const f of [220, 233.08, 329.63]) tone(V, t + 0.2, f, { type: 'sawtooth', lp: [900], peak: 0.12, a: 0.6, hold: 0.8, tau: 0.5 });
    const to = wobble(V, t, t + 5, 13, 0.5);
    for (const f of [1760, 1864.66]) tone(V, t + 0.1, f, { peak: 0.12, a: 0.05, hold: 0.6, tau: 0.5, to });
  } }),
  'hollow-down': def('event', { label: 'The Hollow is driven back', wet: 0.55, haptic: [40, 40, 80], play(V, t) {
    bell(V, t, 440, { tau: 1.4 });
    [880, 1108.73, 1318.51, 1760].forEach((f, i) => glass(V, t + 0.15 + i * 0.1, f, { peak: 0.4, tau: 0.7 }));
    boom(V, t, { peak: 0.3, f: 55, to: 45, tau: 0.5 });
  } }),
  'wraith-down': def('event', { label: 'A Wraith is cut down', wet: 0.5, play(V, t) {
    tone(V, t, 1318.51, { glide: [880, 0.5], peak: 0.35, a: 0.005, tau: 0.35 });
    hiss(V, t, { f: 1500, sweep: [600, 0.6], q: 2, peak: 0.2, a: 0.05, tau: 0.25 });
  } }),

  // The keep by day.
  arrive: def('event', { label: 'Someone arrives at the gate', wet: 0.25, play(V, t) {
    knock(V, t);
    knock(V, t + 0.18, { peak: 0.85 });
    glass(V, t + 0.45, 783.99, { peak: 0.3, tau: 0.5 });
  } }),
  build: def('event', { label: 'The masons raise a room', wet: 0.25, play(V, t) {
    for (let i = 0; i < 3; i++) {
      knock(V, t + i * 0.22, { f: 1800, low: 220 });
      tone(V, t + i * 0.22, 2400, { peak: 0.1, tau: 0.08 });
    }
    bell(V, t + 0.75, 392, { tau: 0.9, peak: 0.45 });
  } }),
  mirror: def('event', { label: 'A mirror is finished', wet: 0.6, play(V, t) {
    [1567.98, 1975.53, 2349.32, 2637.02].forEach((f, i) => glass(V, t + i * 0.04, f, { peak: 0.3, tau: 0.7 }));
    hiss(V, t, { type: 'highpass', f: 5000, peak: 0.12, a: 0.2, tau: 0.2 });
  } }),
  vigil: def('event', { label: 'A vigil eases Dread', wet: 0.55, play(V, t) {
    bell(V, t, 587.33, { tau: 1.2, peak: 0.7 });
    tone(V, t, 293.66, { peak: 0.12, a: 0.4, hold: 0.6, tau: 0.5 });
  } }),
  forge: def('event', { label: 'Grave-steel is forged', play(V, t) {
    for (const at of [0, 0.3]) {
      for (const [r, a, d] of [[1, 0.35, 0.9], [2.76, 0.18, 0.5], [5.4, 0.08, 0.25]]) tone(V, t + at, 880 * r, { peak: a, tau: d, a: 0.001 });
      hiss(V, t + at, { type: 'highpass', f: 3000, peak: 0.3, a: 0.001, tau: 0.02 });
    }
  } }),
  blessed: def('event', { label: 'The inspector blesses the keep', wet: 0.5, play(V, t) {
    bell(V, t, 523.25, { tau: 1.2, peak: 0.7 });
    [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => glass(V, t + 0.2 + i * 0.1, f, { peak: 0.3, tau: 0.6 }));
  } }),
  censured: def('event', { label: 'The inspector censures the keep', wet: 0.45, play(V, t) {
    bell(V, t, 164.81, { tau: 1.5, peak: 0.8 });
    for (const f of [329.63, 349.23]) tone(V, t + 0.1, f, { type: 'triangle', lp: [1500], peak: 0.2, a: 0.05, hold: 0.6, tau: 0.3 });
  } }),
  warn: def('event', { label: 'Something needs you: hunger, sickness, a haunting', every: 700, wet: 0.3, play(V, t) {
    tone(V, t, 440, { type: 'triangle', lp: [1600], peak: 0.45, a: 0.01, hold: 0.12, tau: 0.08 });
    tone(V, t + 0.2, 349.23, { type: 'triangle', lp: [1600], peak: 0.45, a: 0.01, hold: 0.2, tau: 0.15 });
  } }),
  good: def('event', { label: 'Good news', every: 400, play(V, t) {
    tone(V, t, 523.25, { peak: 0.35, tau: 0.3 });
    tone(V, t, 523.25, { type: 'triangle', peak: 0.12, tau: 0.25 });
    tone(V, t + 0.13, 783.99, { peak: 0.35, tau: 0.4 });
    tone(V, t + 0.13, 783.99, { type: 'triangle', peak: 0.12, tau: 0.3 });
  } }),
};

// Each sound's trim to its group's level: alarms -16 dBFS over their loudest 400 ms, events -20, small
// sounds -27, beds -30. Measured on what survives a 300 Hz highpass (roughly a phone speaker), unless the full
// range is more than 6 dB louder, when headphones decide. Re-measure after changing a sound (the browser
// check prints a new table).
const TRIM = { day: 0.47, dusk: 0.40, night: 0.47, dawn: 0.26, end: 0.30, over: 0.98, horn: 0.58, held: 0.30, breached: 0.86, knell: 0.74, rest: 0.66, wake: 0.30, restless: 0.31, wraith: 0.57, fade: 0.33, banish: 0.56, light: 1.01, post: 0.72, ward: 0.32, hush: 0.56, unhush: 0.25, nope: 0.67, seep: 1.22, 'foe-down': 1.56, snuff: 1.59, caught: 0.80, crack: 0.88, 'ward-break': 0.61, maw: 1.66, smash: 1.28, breaking: 0.86, broken: 1.94, 'maw-down': 0.66, hollow: 0.87, heartbeat: 1.50, torn: 1.15, 'hollow-down': 0.32, 'wraith-down': 0.52, arrive: 0.87, build: 0.98, mirror: 0.41, vigil: 0.59, forge: 0.22, blessed: 0.42, censured: 0.43, warn: 0.36, good: 0.29 };
for (const [k, v] of Object.entries(TRIM)) SOUNDS[k].gain = v;
export const BED_TRIM = { day: 0.41, night: 0.33, dusk: 0.19, rite: 0.16 };

/* ---------------------------------------------------------------- beds: the sound under each phase */

// Each bed is a running graph under one gain, faded in when its phase begins and out when it ends.
function bedGain(A, t, trim = 1) {
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(trim, t + 2.5);
  g.connect(A.ambDry);
  const w = A.ctx.createGain();
  w.gain.value = 0.35;
  g.connect(w);
  w.connect(A.ambWet);
  return g;
}
function lfo(A, t, rate, depth, param) {
  const l = A.ctx.createOscillator();
  const d = A.ctx.createGain();
  l.frequency.value = rate;
  d.gain.value = depth;
  l.connect(d);
  d.connect(param);
  l.start(t);
  return l;
}
function loopNoise(A, t) {
  const src = A.ctx.createBufferSource();
  src.buffer = A.noise;
  src.loop = true;
  src.start(t, A.rand() * 1.5);
  return src;
}
function filt(A, type, f, q = 0.7) {
  const fl = A.ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  return fl;
}
function level(A, v) {
  const g = A.ctx.createGain();
  g.gain.value = v;
  return g;
}
const chain = (...ns) => {
  for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
  return ns[ns.length - 1];
};
// A slow chord that breathes.
function pad(A, t, out, fs, cutoff) {
  const lp = filt(A, 'lowpass', cutoff);
  const breath = level(A, 0.75);
  const srcs = [lfo(A, t, 0.07, 0.25, breath.gain)];
  chain(lp, breath, out);
  for (const [i, f] of fs.entries()) {
    for (const [type, m, v] of [['sine', 1, 0.1], ['triangle', 1.004, 0.05]]) {
      const o = A.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * m;
      o.detune.value = (i - 1) * 3;
      chain(o, level(A, v), lp);
      o.start(t);
      srcs.push(o);
    }
  }
  return srcs;
}

export const BEDS = {
  // Wind over the lake, and the water against the walls.
  day(A, t, out) {
    const wind = filt(A, 'lowpass', 650);
    const windLvl = level(A, 0.3);
    const water = filt(A, 'bandpass', 330, 1.2);
    const waterLvl = level(A, 0.22);
    const air = filt(A, 'highpass', 4500);
    chain(loopNoise(A, t), wind, windLvl, out);
    chain(loopNoise(A, t), water, waterLvl, out);
    chain(loopNoise(A, t), air, level(A, 0.015), out);
    return { srcs: [lfo(A, t, 0.06, 260, wind.frequency), lfo(A, t, 0.11, 0.13, windLvl.gain), lfo(A, t, 0.23, 0.12, waterLvl.gain)] };
  },
  // The Tain: a low drone that opens as the Unlit gather, air, and now and then a far-off glass note.
  night(A, t, out) {
    // The deep drone, and above it a thin voice that a phone speaker can carry; both open as danger grows.
    const lp = filt(A, 'lowpass', 260, 1.2);
    const mid = filt(A, 'lowpass', 700, 2);
    chain(lp, level(A, 0.9), out);
    chain(mid, level(A, 0.9), out);
    const srcs = [];
    for (const [type, f, v, to] of [['sine', 55, 0.09, lp], ['sine', 55.4, 0.09, lp], ['triangle', 110.3, 0.08, lp], ['triangle', 164.81, 0.06, lp], ['sawtooth', 220.4, 0.09, mid], ['triangle', 329.63, 0.06, mid], ['sawtooth', 330.9, 0.025, mid]]) {
      const o = A.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      chain(o, level(A, v), to);
      o.start(t);
      srcs.push(o);
    }
    const air = filt(A, 'bandpass', 420, 0.8);
    chain(loopNoise(A, t), air, level(A, 0.06), out);
    const breath = filt(A, 'bandpass', 700, 5);
    const breathLvl = level(A, 0.05);
    chain(loopNoise(A, t), breath, breathLvl, out);
    srcs.push(lfo(A, t, 0.09, 0.04, breathLvl.gain));
    srcs.push(lfo(A, t, 0.05, 80, lp.frequency));
    return {
      srcs,
      danger(d, now) {
        if (Math.abs(d - (this.d ?? -1)) < 0.05) return;
        this.d = d;
        lp.frequency.setTargetAtTime(260 + 700 * d, now, 1.5);
        mid.frequency.setTargetAtTime(700 + 1500 * d, now, 1.5);
      },
      pings: [880, 1046.5, 1174.66, 1318.51, 1567.98],
    };
  },
  // Dusk: a minor chord. The rite and the season's end: a major one.
  dusk(A, t, out) {
    return { srcs: pad(A, t, out, [220, 261.63, 329.63, 440], 1400) };
  },
  rite(A, t, out) {
    return { srcs: pad(A, t, out, [220, 329.63, 554.37, 659.26], 1800) };
  },
};

/* ---------------------------------------------------------------- the graph */

// A second of reverb, made rather than recorded: noise dying away, darker as it dies.
function impulse(ctx, secs, rand) {
  const rate = ctx.sampleRate;
  const n = Math.floor(secs * rate);
  const buf = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const at = i / rate;
      y += (rand() * 2 - 1 - y) * (0.7 - 0.55 * (at / secs));
      d[i] = y * Math.exp(-at / (secs / 5.5)) * Math.min(1, i / (rate * 0.01));
    }
  }
  return buf;
}
// The buses: effects and beds, each dry and to the reverb at its own volume, into a limiter so that many
// sounds at once never clip.
function graph(ctx, rand) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  limiter.connect(ctx.destination);
  const master = level({ ctx }, 1);
  master.connect(limiter);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.6, rand);
  chain(verb, level({ ctx }, 0.8), master);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;
  const bus = (to) => {
    const g = level({ ctx }, 1);
    g.connect(to);
    return g;
  };
  return { ctx, rand, noise, master, fxDry: bus(master), fxWet: bus(verb), ambDry: bus(master), ambWet: bus(verb) };
}

/* ---------------------------------------------------------------- the engine the page uses */

// The page makes one: set() the volumes, unlock() on a tap or key (browsers start sound only then), play()
// each cue, and mood() every frame with the phase's bed, how close the Hollow is and how much danger there is.
export function createSound({ AudioContext: AC = globalThis.AudioContext || globalThis.webkitAudioContext, now = () => performance.now(), rand = Math.random } = {}) {
  let ctx = null;
  let A = null;
  const vol = { on: true, fx: 0.8, amb: 0.5 };
  const last = {};
  let voices = 0;
  let bed = null;
  let bedName = 'none';
  let beatAt = 0;
  let pingAt = 0;
  let hidden = false;
  const ready = () => !!ctx && ctx.state === 'running' && vol.on;

  function apply() {
    if (!A) return;
    const t = ctx.currentTime;
    for (const [g, v] of [[A.fxDry, vol.fx], [A.fxWet, vol.fx], [A.ambDry, vol.amb], [A.ambWet, vol.amb], [A.master, vol.on ? 1 : 0]]) g.gain.setTargetAtTime(v, t, 0.05);
  }
  function run(name, t, pan) {
    const S = SOUNDS[name];
    const V = voice(A, t, { gain: S.gain, pan, wet: S.wet });
    S.play(V, t);
    voices++;
    setTimeout(() => {
      voices--;
      V.done();
    }, (V.end - ctx.currentTime + 0.5) * 1000);
  }
  function setBed(name) {
    if (name === bedName) return;
    const t = ctx.currentTime;
    if (bed) {
      const old = bed;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, 0.6);
      setTimeout(() => {
        for (const s of old.srcs) s.stop();
        old.gain.disconnect();
      }, 4500);
    }
    bedName = name;
    bed = null;
    if (!BEDS[name]) return;
    const gain = bedGain(A, t, BED_TRIM[name]);
    bed = { gain, ...BEDS[name](A, t, gain) };
  }

  return {
    get state() {
      return ctx ? ctx.state : 'none';
    },
    get bed() {
      return bedName;
    },
    set({ on = vol.on, fx = vol.fx, amb = vol.amb } = {}) {
      Object.assign(vol, { on, fx, amb });
      apply();
      if (ctx && !on && ctx.state === 'running') setTimeout(() => !vol.on && ctx.suspend().catch(() => {}), 300);
      if (ctx && on && !hidden && ctx.state !== 'running') ctx.resume().catch(() => {});
    },
    // Called on a tap or a key: the first makes the audio context, later ones wake it if the phone put it to
    // sleep (a call, another app's sound).
    unlock() {
      if (!AC || !vol.on || hidden) return;
      if (!ctx) {
        try {
          ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          return;
        }
        A = graph(ctx, rand);
        apply();
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    },
    hide(h) {
      hidden = h;
      if (!ctx) return;
      if (h) ctx.suspend().catch(() => {});
      else if (vol.on) ctx.resume().catch(() => {});
    },
    // A cue: false if it didn't sound (sound off, not unlocked, or too soon after the last of its kind).
    play(name, { pan = 0 } = {}) {
      const S = SOUNDS[name];
      if (!S || !ready() || vol.fx <= 0) return false;
      const ms = now();
      if (ms - (last[name] ?? -1e9) < S.every) return false;
      if (voices >= 18 && S.group === 'small') return false;
      last[name] = ms;
      run(name, ctx.currentTime + 0.01, pan);
      return true;
    },
    // Every frame: the bed for the phase, far glass notes in the Tain, and the Hollow's heartbeat, faster as
    // it nears the mirrors (hollow 0 at the Deep, 1 at the Veil; null when it isn't walking).
    mood({ bed: name = 'none', hollow = null, danger = 0 } = {}) {
      if (!ready()) return;
      setBed(vol.amb > 0 ? name : 'none');
      const t = ctx.currentTime;
      if (bed?.danger) bed.danger(danger, t);
      if (bed?.pings && vol.amb > 0) {
        if (!pingAt) pingAt = t + 2 + rand() * 4;
        if (t >= pingAt) {
          const V = voice(A, t + 0.02, { gain: 0.12, pan: rand() * 1.2 - 0.6, wet: 0.9, bed: true });
          glass(V, t + 0.02, bed.pings[Math.floor(rand() * bed.pings.length)], { peak: 1, tau: 0.9 });
          setTimeout(V.done, (V.end - t + 0.5) * 1000);
          pingAt = t + 3 + rand() * 6;
        }
      } else pingAt = 0;
      if (hollow === null || vol.fx <= 0) beatAt = 0;
      else {
        if (!beatAt || beatAt < t) beatAt = t + 0.05;
        if (beatAt < t + 0.15) {
          run('heartbeat', beatAt, 0);
          beatAt += 60 / (48 + 44 * Math.max(0, Math.min(1, hollow)));
          return 'beat';
        }
      }
      return undefined;
    },
  };
}

// For the checks: one sound, or a few seconds of a bed, rendered offline at full volume.
export function renderSound(OfflineCtx, name, { seconds = 4, rate = 44100, rand = Math.random, bed = false } = {}) {
  const ctx = new OfflineCtx(2, Math.round(seconds * rate), rate);
  const A = graph(ctx, rand);
  if (bed) {
    const g = bedGain(A, 0, BED_TRIM[name]);
    const b = BEDS[name](A, 0, g);
    if (b.danger) b.danger(0.5, 0);
  } else {
    const S = SOUNDS[name];
    const V = voice(A, 0.02, { gain: S.gain, wet: S.wet });
    S.play(V, 0.02);
  }
  return ctx.startRendering();
}
