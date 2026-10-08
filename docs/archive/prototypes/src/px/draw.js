// Draws the pixel keep: the day keep, the Tain made from it by the palette lookup, the night's candles,
// shades and Creepers under dithered candlelight, and the dusk crossing between the two.
// Browser only (canvas). Geometry, cameras and the light rule come from scene.js.

import { P, MF, rngOf, R, D, A, clip, sky, speck, bricks, crenel, roof, ellipse, ring, room as paintRoom, flame, glow, human } from './kit.js';
import { UMBRA, applyTain, applyLight } from './lut.js';
import { WORLD, VIEW_H, ROOMS, room, feet, LIGHT, flamePoint, roomAt, toView, candleLight } from './scene.js';

const { W, VEIL } = WORLD;
export const DAY_H = VEIL + 24; // the day view: the keep and a strip of its reflection in the moat

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const ctxOf = (cv) => {
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = false;
  return c;
};

/* ---------------------------------------------------------------- static layers */

let cache = null;
function layers() {
  if (cache) return cache;
  const rnd = rngOf(20260926);
  const keep = keepLayer(rnd);
  cache = {
    sky: { day: skyLayer('day', rnd), sunset: skyLayer('sunset', rnd), night: skyLayer('night', rnd) },
    keep,
    tain: tainLayer(keep, rnd),
  };
  cache.nightKeep = nightKeepLayer(cache);
  return cache;
}

function ridge(c, base, amp, col, seed) {
  for (let x = 0; x < W; x++) {
    const v = 0.5 + 0.3 * Math.sin(x * 0.07 + seed) + 0.14 * Math.sin(x * 0.16 + seed * 2) + 0.07 * Math.sin(x * 0.4 + seed * 3);
    const top = Math.round(base - amp * v);
    R(c, x, top, 1, base - top + 1, col);
  }
}

function skyLayer(kind, rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  const cols = {
    day: ['#3b7dd8', '#5a9be6', '#86bff0', '#bfe1f6'],
    sunset: [P.indigo, P.grape, P.mauve, P.pink, P.amber],
    night: [P.void, P.night, P.ink, P.indigo],
  }[kind];
  sky(c, 0, 0, W, VEIL, cols);
  if (kind === 'day') {
    for (const [x, y, r] of [[18, 12, 5], [25, 10, 4], [88, 18, 4], [95, 16, 5]]) ellipse(c, x, y, r, MF(r / 2) + 1, P.white);
    ellipse(c, 102, 7, 4, 4, P.yellow);
  }
  if (kind === 'sunset') ellipse(c, 100, 64, 9, 9, P.yellow);
  if (kind === 'night') {
    speck(c, rnd, 0, 0, W, 40, P.white, 0.008);
    ellipse(c, 16, 11, 4, 4, P.bone);
    ellipse(c, 18, 10, 3, 3, P.void);
  }
  ridge(c, VEIL, 22, kind === 'day' ? '#6fa878' : kind === 'night' ? '#1b2a3a' : '#6b3f5a', 1.7);
  return cv;
}

// The one room still lit in the living keep at night: firelight spilling from the fireplace.
function hearthGlow(c, k) {
  if (k <= 0) return;
  const h = room('hearth');
  clip(c, h.x, h.y, h.w, h.h, () => {
    glow(c, h.x + 8, feet(h) - 4, 16, P.amber, 0.55 * k);
    glow(c, h.x + 8, feet(h) - 3, 8, P.orange, 0.5 * k);
  });
}

function mirror(c, x, y) {
  R(c, x, y, 5, 7, P.amber);
  R(c, x + 1, y + 1, 3, 5, '#bfe3ef');
  D(c, x + 1, y + 1, P.white);
}

function keepLayer(rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  const S = { base: P.steel, dark: P.slate, light: P.silver };
  bricks(c, rnd, 2, 42, 108, 46, S);
  crenel(c, 2, 42, 44, P.steel, P.slate);
  crenel(c, 66, 42, 44, P.steel, P.slate);
  bricks(c, rnd, 0, 30, 10, 12, S);
  roof(c, 5, 30, 6, 10, P.crimson, P.plum);
  bricks(c, rnd, 102, 30, 10, 12, S);
  roof(c, 107, 30, 6, 10, P.crimson, P.plum);
  bricks(c, rnd, 46, 22, 20, 20, S);
  roof(c, 56, 22, 12, 12, P.crimson, P.plum);
  for (const [x, y] of [[4, 34], [106, 34], [55, 28], [55, 35]]) R(c, x, y, 2, 3, P.amber);
  bricks(c, rnd, 0, 88, W, 4, { base: P.slate, dark: P.indigo, light: P.steel });
  const tones = { chapel: ['#4a3a52', P.grape], granary: ['#5a4a38', P.brown], hearth: ['#5a4038', P.brown], crypt: ['#2a2430', P.soot] };
  for (const r of ROOMS) paintRoom(c, rnd, r.x, r.y, r.w, r.h, { wall: tones[r.id][0], wall2: tones[r.id][1], floor: P.brown, floorTop: P.clay });

  // Chapel: stained glass, an altar with two candlesticks, a pew, the chapel glass.
  let r = room('chapel');
  R(c, r.x + 3, r.y + 3, 7, 10, P.ink);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) D(c, r.x + 4 + i, r.y + 4 + j, [P.red, P.blue, P.yellow, P.green][(i + j) % 4]);
  R(c, r.x + 13, r.y + 13, 11, 5, P.steel);
  R(c, r.x + 13, r.y + 13, 11, 1, P.silver);
  R(c, r.x + 14, r.y + 11, 1, 2, P.bone);
  R(c, r.x + 22, r.y + 11, 1, 2, P.bone);
  R(c, r.x + 29, r.y + 15, 11, 3, P.brown);
  R(c, r.x + 29, r.y + 14, 11, 1, P.clay);
  mirror(c, r.x + 42, r.y + 4);

  // Granary: sacks, a barrel, a small window.
  r = room('granary');
  for (let i = 0; i < 4; i++) ellipse(c, r.x + 6 + i * 6, r.y + 15, 2, 2, i % 2 ? P.tan : P.bone);
  ellipse(c, r.x + 9, r.y + 11, 2, 2, P.bone);
  ellipse(c, r.x + 15, r.y + 11, 2, 2, P.tan);
  R(c, r.x + 32, r.y + 10, 6, 8, P.clay);
  R(c, r.x + 32, r.y + 12, 6, 1, P.brown);
  R(c, r.x + 32, r.y + 15, 6, 1, P.brown);
  R(c, r.x + 40, r.y + 4, 4, 5, P.ink);
  R(c, r.x + 41, r.y + 5, 2, 3, '#86bff0');

  // Hearth: the fireplace, a table with a pot, a shelf of jars.
  r = room('hearth');
  R(c, r.x + 2, r.y + 5, 12, 13, P.indigo);
  R(c, r.x + 4, r.y + 9, 8, 9, P.night);
  R(c, r.x + 1, r.y + 4, 14, 1, P.slate);
  R(c, r.x + 22, r.y + 13, 12, 1, P.clay);
  R(c, r.x + 23, r.y + 14, 1, 4, P.brown);
  R(c, r.x + 32, r.y + 14, 1, 4, P.brown);
  ellipse(c, r.x + 27, r.y + 11, 2, 1, P.ink);
  R(c, r.x + 37, r.y + 6, 9, 1, P.clay);
  D(c, r.x + 38, r.y + 5, P.bone);
  D(c, r.x + 41, r.y + 5, P.tan);
  D(c, r.x + 44, r.y + 5, P.green);

  // Crypt: skull niches, the slab, a mirror.
  r = room('crypt');
  for (const [dx, dy] of [[3, 4], [3, 9], [8, 4]]) {
    R(c, r.x + dx, r.y + dy, 4, 3, P.night);
    D(c, r.x + dx + 1, r.y + dy + 1, P.bone);
  }
  R(c, r.x + 14, r.y + 14, 18, 4, P.slate);
  R(c, r.x + 14, r.y + 14, 18, 1, P.steel);
  mirror(c, r.x + 38, r.y + 4);
  return cv;
}

// The Tain upright: the day keep recoloured by the palette lookup, over the Deep where the sky was,
// with each twin's own details on top.
function tainLayer(keep, rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  sky(c, 0, 0, W, VEIL, ['#07050c', '#0e0b18', '#150f28', '#1b1430']);
  speck(c, rnd, 0, 0, W, 44, '#2a1d45', 0.03);
  for (const [x0, y0] of [[12, 2], [60, 4], [96, 1]]) {
    let x = x0;
    for (let y = y0; y < y0 + 9; y++) {
      D(c, x, y, '#3e1030');
      if (y % 3 === 0) D(c, x, y, P.hot);
      x += MF(rnd() * 3) - 1;
    }
  }
  const k = mk(W, VEIL);
  const kc = ctxOf(k);
  kc.drawImage(keep, 0, 0);
  const img = kc.getImageData(0, 0, W, VEIL);
  applyTain(img.data);
  kc.putImageData(img, 0, 0);
  c.drawImage(k, 0, 0);

  // Hollow Granary: the stores are gone; only their outlines remain.
  let r = room('granary');
  R(c, r.x + 3, r.y + 8, 38, 10, UMBRA[2]);
  for (let i = 0; i < 4; i++) ring(c, r.x + 6 + i * 6, r.y + 15, 2, UMBRA[3]);
  ring(c, r.x + 9, r.y + 11, 2, UMBRA[3]);
  for (const dy of [0, 7]) R(c, r.x + 32, r.y + 10 + dy, 6, 1, UMBRA[3]);
  for (const dx of [0, 5]) R(c, r.x + 32 + dx, r.y + 10, 1, 8, UMBRA[3]);
  // Waking Room: the slab glows.
  r = room('crypt');
  R(c, r.x + 14, r.y + 14, 18, 1, UMBRA[6]);
  R(c, r.x + 13, r.y + 15, 1, 3, UMBRA[5]);
  R(c, r.x + 32, r.y + 15, 1, 3, UMBRA[5]);
  return cv;
}

function nightKeepLayer(L) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  c.drawImage(L.sky.night, 0, 0);
  c.drawImage(L.keep, 0, 0);
  A(c, 0.62, () => R(c, 0, 0, W, VEIL, '#0b0d26'));
  hearthGlow(c, 1);
  for (const [x, y] of [[4, 34], [106, 34], [55, 28]]) R(c, x, y, 2, 3, P.yellow);
  return cv;
}

/* ---------------------------------------------------------------- sprites */

const EYES = { loyal: P.cyan, serene: '#cfe0ff', pale: P.white, stranger: P.green };
const SHADE_BODY = { pale: ['#4a4466', '#5a5478'] };

function shadeBody(c, s, t) {
  const [body, skin] = SHADE_BODY[s.kind] || ['#07060d', '#07060d'];
  human(c, s.x, feet(room(s.room)), { body, skin, legs: body, hood: s.kind === 'serene' ? body : undefined, ph: s.x }, t);
}
function shadeEyes(c, s) {
  const top = feet(room(s.room)) - 8;
  D(c, s.x + 1, top + 1, EYES[s.kind] || P.cyan);
  D(c, s.x + 2, top + 1, EYES[s.kind] || P.cyan);
}
const creeperX = (k, t) => (k.patrol ? k.patrol[0] + (k.patrol[1] - k.patrol[0]) * (0.5 + 0.5 * Math.sin(t * 0.7 + k.patrol[0])) : k.x);
function creeperBody(c, k, t) {
  const x = Math.round(creeperX(k, t));
  const y = feet(room(k.room));
  const bob = Math.round(Math.sin(t * 4 + x));
  R(c, x, y - 3 + bob, 7, 3, '#050308');
  D(c, x - 1, y - 1 + bob, '#050308');
  D(c, x + 7, y - 1 + bob, '#050308');
  for (let i = 0; i < 3; i++) D(c, x + 1 + i * 2, y + bob, (MF(t * 8) + i) % 2 ? '#050308' : '#1a0d1a');
}
function creeperEyes(c, k, t) {
  const x = Math.round(creeperX(k, t));
  const y = feet(room(k.room));
  const bob = Math.round(Math.sin(t * 4 + x));
  D(c, x + 3, y - 2 + bob, P.hot);
  D(c, x + 5, y - 2 + bob, P.hot);
}

/* ---------------------------------------------------------------- the night */

const work = typeof document !== 'undefined' ? mk(W, VEIL) : null;

// Light as the renderer sees it: scene.js's rule, with a candle's strength k (for lighting up) and a flicker.
function lightFor(scene, t, still) {
  return (x, y) => {
    const r = roomAt(x, y);
    let L = LIGHT.ambient;
    if (!r) return L;
    for (const c of scene.candles) {
      if (c.room !== r.id || (c.k ?? 1) <= 0) continue;
      const p = flamePoint(c);
      const k = (c.k ?? 1) * (still ? 1 : 1 + 0.04 * Math.sin(t * 9 + c.x));
      L = Math.max(L, candleLight(Math.hypot(x - p.x, y - p.y), k));
    }
    return L;
  };
}

// The Tain upright, lit, with everything in it. Returns the working canvas (W x VEIL).
function composeTain(scene, t, { still = false, soul = null } = {}) {
  const L = layers();
  const c = ctxOf(work);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, VEIL);
  c.drawImage(L.tain, 0, 0);
  const choir = room('chapel');
  const beat = still ? 0 : MF(t * 3) % 3;
  ring(c, choir.x + 18, choir.y + 12, 4 + beat, UMBRA[5], (dx, dy) => dy < 0);
  for (const k of scene.candles) {
    if ((k.k ?? 1) <= 0) continue;
    const f = feet(room(k.room));
    R(c, k.x, f - 3, 1, 3, UMBRA[6]);
  }
  for (const s of scene.shades) if ((s.a ?? 1) > 0) shadeBody(c, s, still ? 0 : t);
  for (const k of scene.creepers) creeperBody(c, k, still ? 0 : t);
  const img = c.getImageData(0, 0, W, VEIL);
  applyLight(img.data, W, VEIL, lightFor(scene, t, still));
  c.putImageData(img, 0, 0);
  // What gives off its own light is drawn after the lighting.
  scene.candles.forEach((k, i) => {
    if ((k.k ?? 1) <= 0.2) return;
    const f = feet(room(k.room));
    flame(c, k.x, f - 4, still ? 0 : t, i);
  });
  const hearth = room('hearth');
  flame(c, hearth.x + 8, feet(hearth) - 1, still ? 0 : t, 3, [P.cyan, '#9fe6ff', P.blue]);
  flame(c, hearth.x + 6, feet(hearth) - 1, still ? 0 : t + 0.3, 5, [P.cyan, '#9fe6ff', P.blue]);
  for (const s of scene.shades) {
    if ((s.a ?? 1) <= 0) continue;
    if (s.fresh) glow(c, s.x + 2, feet(room(s.room)) - 5, 5, '#9fb8ff', 0.3);
    shadeEyes(c, s);
  }
  for (const k of scene.creepers) creeperEyes(c, k, still ? 0 : t);
  if (soul) {
    glow(c, soul.x, soul.y, 4, '#cfe0ff', 0.5);
    R(c, soul.x - 1, soul.y - 1, 2, 3, P.white);
  }
  return work;
}

// Lays out a night view the reflection's way: 8 rows of the keep at night, the Veil, then the Tain
// mirrored below it. The flipped camera turns this over as a whole.
function composeView(v, tain, veilGlow = 0) {
  const L = layers();
  v.setTransform(1, 0, 0, 1, 0, 0);
  v.clearRect(0, 0, W, VIEW_H);
  v.drawImage(L.nightKeep, 0, VEIL - 8, W, 8, 0, 0, W, 8);
  v.setTransform(1, 0, 0, -1, 0, VIEW_H);
  v.drawImage(tain, 0, 0);
  v.setTransform(1, 0, 0, 1, 0, 0);
  R(v, 0, 7, W, 1, P.mauve);
  if (veilGlow > 0) A(v, veilGlow, () => R(v, 0, 6, W, 3, '#f0b0ff'));
}

const viewBuf = typeof document !== 'undefined' ? mk(W, VIEW_H) : null;

function output(out, mode, squash = 1) {
  const o = ctxOf(out);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, out.width, out.height);
  const sy = mode === 'flipped' ? -squash : squash;
  o.setTransform(1, 0, 0, sy, 0, (VIEW_H * (1 - sy)) / 2);
  o.drawImage(viewBuf, 0, 0);
  o.setTransform(1, 0, 0, 1, 0, 0);
}

// A night in the Tain as the chosen camera shows it. `out` is VIEW_H rows tall.
export function drawNight(out, scene, mode, t, { still = false } = {}) {
  composeView(ctxOf(viewBuf), composeTain(scene, t, { still }));
  output(out, mode);
}

// Outlines a box given in upright Tain coordinates, in the camera's view.
export function markBox(out, mode, box, color) {
  const a = toView(mode, box.x, box.y);
  const b = toView(mode, box.x + box.w, box.y + box.h);
  const c = ctxOf(out);
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.strokeRect(Math.min(a.x, b.x) - 1.5, Math.min(a.y, b.y) - 1.5, Math.abs(b.x - a.x) + 3, Math.abs(b.y - a.y) + 3);
}

/* ---------------------------------------------------------------- the day */

const dayBuf = typeof document !== 'undefined' ? mk(W, VEIL) : null;
const LIVING = [
  { room: 'chapel', x: 30, o: { body: P.bone, hood: P.bone, robe: 1, walk: 2 }, walk: 8 },
  { room: 'granary', x: 70, o: { body: P.clay, hair: P.brown, carry: P.bone, walk: 3 }, walk: 14 },
  { room: 'hearth', x: 24, o: { body: P.bone, hair: P.brown } },
  { room: 'crypt', x: 36, o: { body: P.ink, hair: P.tan } },
];

function drawLiving(c, t, leave = 0) {
  for (const [i, p] of LIVING.entries()) {
    const r = room(p.room);
    let x = p.x + (p.walk ? Math.round(Math.sin(t * 0.6 + i) * p.walk * 0.5) : 0);
    if (leave > 0) x = Math.round(x + (r.x + 1 - x) * leave);
    A(c, 1 - leave, () => human(c, x, feet(r), { ...p.o, ph: i, face: i % 2 ? -1 : 1 }, t));
  }
}
function drawBody(c) {
  const r = room('crypt');
  R(c, r.x + 16, r.y + 12, 12, 2, P.bone);
  R(c, r.x + 15, r.y + 12, 2, 2, P.peach);
}
function drawReflection(o, src, t, rows, dark = 0.55) {
  for (let i = 0; i < rows; i++) {
    const dx = Math.round(Math.sin(t * 2 + i * 0.9) * (i > 2 ? 1 : 0));
    o.drawImage(src, 0, VEIL - 1 - i, W, 1, dx, VEIL + i, W, 1);
  }
  A(o, dark, () => R(o, 0, VEIL, W, rows, '#1a1826'));
}

// The keep by day, with its reflection in the moat. `out` is DAY_H rows tall.
export function drawDay(out, t) {
  const L = layers();
  const c = ctxOf(dayBuf);
  c.drawImage(L.sky.day, 0, 0);
  c.drawImage(L.keep, 0, 0);
  const h = room('hearth');
  glow(c, h.x + 8, feet(h) - 3, 6, P.orange, 0.25);
  flame(c, h.x + 8, feet(h) - 1, t, 0);
  flame(c, h.x + 6, feet(h) - 1, t + 0.4, 1);
  drawLiving(c, t);
  drawBody(c);
  const o = ctxOf(out);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.drawImage(dayBuf, 0, 0);
  drawReflection(o, dayBuf, t, DAY_H - VEIL);
  R(o, 0, VEIL, W, 1, P.steel);
}

/* ---------------------------------------------------------------- the crossing */

export const CROSSING_SECS = 10;
const CAPTIONS = [
  [0, 'Sunset. The bell rings and the living head for bed.'],
  [2.6, 'Lights out. The keep goes dark, all but the Hearth.'],
  [4, 'The dead rise. Ada sinks through the Veil and wakes in the Waking Room.'],
  [6.8, 'At their posts. Candles are lit and every shade is where you put it.'],
];
export const crossingCaption = (t) => CAPTIONS.filter(([at]) => t >= at).pop()[1];
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = (x) => x * x * (3 - 2 * x);
const tall = typeof document !== 'undefined' ? mk(W, 2 * VEIL) : null;

// The dusk crossing at time t (0 to CROSSING_SECS): sunset, lights out, the dead rise, the camera
// slides down into the Tain, candles and shades come up. The flipped camera turns over at the end.
export function drawCrossing(out, t, mode, night) {
  const L = layers();
  const c = ctxOf(dayBuf);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(L.sky.day, 0, 0);
  A(c, ramp(t, 0.3, 2.4), () => c.drawImage(L.sky.sunset, 0, 0));
  A(c, ramp(t, 2.6, 4), () => c.drawImage(L.sky.night, 0, 0));
  c.drawImage(L.keep, 0, 0);
  A(c, 0.28 * ramp(t, 0.5, 2.4) * (1 - ramp(t, 2.6, 4)), () => R(c, 0, 0, W, VEIL, P.orange));
  const dark = ramp(t, 2.6, 4);
  A(c, 0.62 * dark, () => R(c, 0, 0, W, VEIL, '#0b0d26'));
  const h = room('hearth');
  hearthGlow(c, dark);
  flame(c, h.x + 8, feet(h) - 1, t, 0);
  drawLiving(c, t, ramp(t, 0.8, 2.6));
  drawBody(c);

  // Ada's soul: up off the slab, then down through the floor and the Veil.
  const crypt = room('crypt');
  const sx = crypt.x + 20;
  const slab = crypt.y + 11;
  let soul = null;
  let tainSoul = null;
  if (t >= 4 && t < 4.7) soul = { x: sx, y: slab - 4 * ease(ramp(t, 4, 4.7)) };
  else if (t >= 4.7 && t < 5.5) soul = { x: sx, y: slab - 4 + (VEIL - slab + 4) * ease(ramp(t, 4.7, 5.5)) };
  else if (t >= 5.5 && t < 6.3) tainSoul = { x: sx, y: VEIL - 1 - (VEIL - 1 - (feet(crypt) - 5)) * ease(ramp(t, 5.5, 6.3)) };
  if (soul) {
    glow(c, soul.x, soul.y, 4, '#cfe0ff', 0.5);
    R(c, soul.x - 1, soul.y - 1, 2, 3, P.white);
  }

  // The Tain: candles light one by one, shades come up; Ada appears where the soul lands.
  const scene = {
    candles: night.candles.map((k, i) => ({ ...k, k: ease(ramp(t, 6.8 + i * 0.35, 7.3 + i * 0.35)) })),
    shades: night.shades.map((s, i) => ({ ...s, a: s.fresh ? (t >= 6.3 ? 1 : 0) : t >= 6.9 + i * 0.25 ? 1 : 0 })),
    creepers: t >= 7.5 ? night.creepers : [],
  };
  const tain = composeTain(scene, t, { soul: tainSoul });
  const T = ctxOf(tall);
  T.setTransform(1, 0, 0, 1, 0, 0);
  T.clearRect(0, 0, W, 2 * VEIL);
  T.drawImage(dayBuf, 0, 0);
  T.setTransform(1, 0, 0, -1, 0, 2 * VEIL);
  T.drawImage(tain, 0, 0);
  T.setTransform(1, 0, 0, 1, 0, 0);
  A(T, 0.5 * (1 - dark), () => R(T, 0, VEIL, W, VEIL, '#1a1826'));
  R(T, 0, VEIL - 1, W, 1, dark > 0.5 ? P.mauve : P.steel);
  const pulse = Math.max(0, 1 - Math.abs(t - 5.5) / 0.5);
  if (pulse > 0) A(T, pulse, () => R(T, sx - 6, VEIL - 2, 13, 3, '#f0b0ff'));

  // The camera slides from the keep down to the Tain, then (flipped) turns over.
  const camY = Math.round((VEIL - 8) * ease(ramp(t, 5, 7)));
  const v = ctxOf(viewBuf);
  v.setTransform(1, 0, 0, 1, 0, 0);
  v.clearRect(0, 0, W, VIEW_H);
  v.drawImage(tall, 0, camY, W, VIEW_H, 0, 0, W, VIEW_H);
  if (mode === 'flipped') {
    const turn = ramp(t, 8.8, 9.6);
    output(out, turn >= 1 ? 'flipped' : 'reflection', turn >= 1 ? 1 : Math.cos(Math.PI * turn));
  } else {
    output(out, 'reflection');
  }
}

// A single sprite on a small swatch, for the test's key.
export function drawKey(out, kind, t = 0) {
  const c = ctxOf(out);
  c.setTransform(1, 0, 0, 1, 0, 0);
  R(c, 0, 0, out.width, out.height, UMBRA[1]);
  R(c, 0, out.height - 2, out.width, 2, UMBRA[3]);
  const fake = { id: 'k', room: 'hearth', x: 6 };
  const shift = feet(room('hearth')) - (out.height - 2);
  c.setTransform(1, 0, 0, 1, 0, -shift);
  if (kind === 'shade') {
    shadeBody(c, { ...fake, kind: 'loyal' }, t);
    shadeEyes(c, { ...fake, kind: 'loyal' });
  } else if (kind === 'creeper') {
    creeperBody(c, { ...fake, x: 4 }, t);
    creeperEyes(c, { ...fake, x: 4 }, t);
  } else {
    R(c, 7, feet(room('hearth')) - 3, 1, 3, UMBRA[6]);
    glow(c, 7, feet(room('hearth')) - 6, 5, P.amber, 0.25);
    flame(c, 7, feet(room('hearth')) - 4, t, 0);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

