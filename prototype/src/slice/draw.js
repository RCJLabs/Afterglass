// Draws the season slice: the keep's eight rooms by day with the living at work, and by night the Tain
// made from the same art by the palette lookup, lit by the simulation's own candlelight, with the
// shades, the Unlit and the Hollow in it. Browser only (canvas). Geometry and cameras come from geo.js.

import { P, MF, rngOf, R, D, A, clip, sky, speck, bricks, crenel, roof, ellipse, ring, room as paintRoom, flame, glow, human } from '../px/kit.js';
import { UMBRA, applyTain, applyLight } from '../px/lut.js';
import { MAP, DEEP_FLOOR, VEIL_FLOOR } from './data.js';
import { FLOORS, feet, roomSpan, lightMap, VIEW_H, toView, unitAt } from './geo.js';

const { W, VEIL, ROOM_H } = MAP;

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export const ctxOf = (cv) => {
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = false;
  return c;
};

/* ---------------------------------------------------------------- the keep, once */

const TONES = {
  chapel: ['#4a3a52', P.grape], glazier: ['#39485a', P.indigo], chandlery: ['#5a4632', P.brown], infirmary: ['#4c5361', P.slate],
  barracks: ['#4a3e36', P.brown], granary: ['#5a4a38', P.brown], hearth: ['#5a4038', P.brown], crypt: ['#2a2430', P.soot],
};
const span = (id) => roomSpan(id);
const top = (id) => FLOORS[span(id).f].y;

function mirrorFrame(c, x, y) {
  R(c, x, y, 5, 7, P.amber);
  R(c, x + 1, y + 1, 3, 5, '#bfe3ef');
  D(c, x + 1, y + 1, P.white);
}

// Room furniture, placed clear of the ladders and hatches at the stairs.
const FURNISH = {
  chapel(c, x, y) {
    R(c, x + 26, y + 3, 7, 10, P.ink);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) D(c, x + 27 + i, y + 4 + j, [P.red, P.blue, P.yellow, P.green][(i + j) % 4]);
    R(c, x + 35, y + 13, 10, 5, P.steel);
    R(c, x + 35, y + 13, 10, 1, P.silver);
    R(c, x + 36, y + 11, 1, 2, P.bone);
    R(c, x + 43, y + 11, 1, 2, P.bone);
    R(c, x + 22, y + 15, 10, 3, P.brown);
    R(c, x + 22, y + 14, 10, 1, P.clay);
  },
  glazier(c, x, y) {
    ellipse(c, x + 7, y + 12, 5, 5, P.rust);
    R(c, x + 2, y + 12, 11, 6, P.rust);
    R(c, x + 5, y + 12, 5, 5, P.night);
    R(c, x + 6, y + 14, 3, 3, P.orange);
    D(c, x + 7, y + 13, P.yellow);
    R(c, x + 16, y + 13, 11, 1, P.clay);
    R(c, x + 17, y + 14, 1, 4, P.brown);
    R(c, x + 25, y + 14, 1, 4, P.brown);
    for (const dx of [17, 21]) {
      R(c, x + dx, y + 9, 3, 4, '#86bff0');
      D(c, x + dx, y + 9, P.white);
    }
    R(c, x + 34, y + 4, 5, 8, P.clay);
    R(c, x + 35, y + 5, 3, 6, P.slate);
  },
  chandlery(c, x, y) {
    R(c, x + 2, y + 4, 13, 1, P.brown);
    for (let i = 0; i < 6; i++) {
      R(c, x + 3 + i * 2, y + 5, 1, 3 + (i % 2), P.bone);
      D(c, x + 3 + i * 2, y + 5, P.tan);
    }
    ellipse(c, x + 26, y + 14, 4, 3, P.slate);
    R(c, x + 22, y + 11, 9, 1, P.steel);
    R(c, x + 23, y + 12, 7, 1, P.tan);
    D(c, x + 24, y + 17, P.orange);
    D(c, x + 27, y + 17, P.amber);
    R(c, x + 38, y + 9, 9, 1, P.clay);
    for (let i = 0; i < 4; i++) R(c, x + 39 + i * 2, y + 6, 1, 3, P.bone);
  },
  infirmary(c, x, y) {
    for (const dx of [2, 17]) {
      R(c, x + dx, y + 14, 10, 2, P.bone);
      R(c, x + dx, y + 13, 3, 1, P.white);
      R(c, x + dx, y + 16, 1, 2, P.brown);
      R(c, x + dx + 9, y + 16, 1, 2, P.brown);
    }
    R(c, x + 34, y + 8, 12, 1, P.clay);
    for (const [dx, col] of [[35, P.green], [38, P.red], [41, P.blue], [44, P.amber]]) R(c, x + dx, y + 6, 2, 2, col);
    R(c, x + 38, y + 11, 3, 3, P.white);
    D(c, x + 39, y + 12, P.red);
  },
  barracks(c, x, y) {
    ellipse(c, x + 4, y + 7, 2, 3, P.crimson);
    D(c, x + 4, y + 7, P.amber);
    R(c, x + 14, y + 16, 11, 1, P.brown);
    for (let i = 0; i < 4; i++) {
      R(c, x + 15 + i * 3, y + 5, 1, 11, P.clay);
      D(c, x + 15 + i * 3, y + 4, P.silver);
    }
    R(c, x + 38, y + 10, 9, 1, P.brown);
    R(c, x + 38, y + 15, 9, 2, P.bone);
    R(c, x + 38, y + 11, 1, 6, P.brown);
    R(c, x + 46, y + 11, 1, 6, P.brown);
  },
  granary(c, x, y) {
    for (let i = 0; i < 3; i++) ellipse(c, x + 4 + i * 5, y + 15, 2, 2, i % 2 ? P.tan : P.bone);
    ellipse(c, x + 6, y + 11, 2, 2, P.bone);
    for (let i = 0; i < 3; i++) ellipse(c, x + 19 + i * 5, y + 15, 2, 2, i % 2 ? P.bone : P.tan);
    R(c, x + 30, y + 10, 6, 8, P.clay);
    R(c, x + 30, y + 12, 6, 1, P.brown);
    R(c, x + 30, y + 15, 6, 1, P.brown);
    R(c, x + 42, y + 4, 4, 5, P.ink);
    R(c, x + 43, y + 5, 2, 3, '#86bff0');
  },
  hearth(c, x, y) {
    R(c, x + 32, y + 5, 12, 13, P.indigo);
    R(c, x + 34, y + 9, 8, 9, P.night);
    R(c, x + 31, y + 4, 14, 1, P.slate);
    R(c, x + 14, y + 13, 7, 1, P.clay);
    R(c, x + 15, y + 14, 1, 4, P.brown);
    R(c, x + 19, y + 14, 1, 4, P.brown);
    ellipse(c, x + 17, y + 11, 2, 1, P.ink);
    R(c, x + 2, y + 6, 6, 1, P.clay);
    D(c, x + 3, y + 5, P.bone);
    D(c, x + 6, y + 5, P.green);
    mirrorFrame(c, MAP.mirrors[0].x - 2, y + 4);
  },
  crypt(c, x, y) {
    for (const [dx, dy] of [[2, 4], [2, 9], [7, 4], [30, 4], [30, 9]]) {
      R(c, x + dx, y + dy, 4, 3, P.night);
      D(c, x + dx + 1, y + dy + 1, P.bone);
    }
    R(c, x + 4, y + 14, 14, 4, P.slate);
    R(c, x + 4, y + 14, 14, 1, P.steel);
    mirrorFrame(c, MAP.mirrors[1].x - 2, y + 4);
  },
};

function ladder(c, st) {
  const y0 = feet(st.f);
  const y1 = feet(st.f + 1);
  R(c, st.x - 2, y0, 5, 2, P.night);
  R(c, st.x - 2, y0 + 2, 5, 2, P.ink);
  R(c, st.x - 2, y0, 1, y1 - y0 + 1, P.clay);
  R(c, st.x + 2, y0, 1, y1 - y0 + 1, P.clay);
  for (let y = y0 + 1; y < y1; y += 3) R(c, st.x - 1, y, 3, 1, P.brown);
}

function keepLayer(rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  const S = { base: P.steel, dark: P.slate, light: P.silver };
  bricks(c, rnd, 0, 20, W, VEIL - 20, S);
  crenel(c, 0, 20, W, P.steel, P.slate);
  bricks(c, rnd, 44, 6, 24, 14, S);
  crenel(c, 44, 6, 24, P.steel, P.slate);
  R(c, 55, 0, 1, 6, P.brown);
  R(c, 56, 0, 5, 3, P.crimson);
  for (const x of [0, 104]) {
    bricks(c, rnd, x, 12, 8, 8, S);
    roof(c, x + 4, 12, 5, 8, P.crimson, P.plum);
  }
  for (const [x, y] of [[50, 11], [60, 11]]) R(c, x, y, 2, 3, P.amber);
  for (let f = 0; f < FLOORS.length; f++) {
    for (const [id, a, b] of FLOORS[f].rooms) {
      paintRoom(c, rnd, a, FLOORS[f].y, b - a, ROOM_H, { wall: TONES[id][0], wall2: TONES[id][1], floor: P.brown, floorTop: P.clay });
      FURNISH[id](c, a, FLOORS[f].y);
    }
  }
  for (const st of MAP.stairs) ladder(c, st);
  bricks(c, rnd, 0, VEIL - 4, W, 4, { base: P.slate, dark: P.indigo, light: P.steel });
  return cv;
}

function skyLayer(kind, rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  const cols = {
    day: ['#3b7dd8', '#5a9be6', '#86bff0', '#bfe1f6'],
    sunset: [P.indigo, P.grape, P.mauve, P.pink, P.amber],
    night: [P.void, P.night, P.ink, P.indigo],
  }[kind];
  sky(c, 0, 0, W, 30, cols);
  if (kind === 'day') for (const [x, y, r] of [[18, 6, 4], [24, 5, 3], [88, 8, 4], [95, 7, 3]]) ellipse(c, x, y, r, MF(r / 2) + 1, P.white);
  if (kind === 'night') {
    speck(c, rnd, 0, 0, W, 20, P.white, 0.01);
    ellipse(c, 20, 6, 3, 3, P.bone);
    ellipse(c, 21, 5, 2, 2, P.void);
  }
  return cv;
}

// The Tain upright: the keep through the palette lookup, over the Deep, with each twin's own details.
function tainLayer(keep, rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  sky(c, 0, 0, W, VEIL, ['#07050c', '#0e0b18', '#150f28', '#1b1430']);
  speck(c, rnd, 0, 0, W, 22, '#2a1d45', 0.04);
  const k = mk(W, VEIL);
  const kc = ctxOf(k);
  kc.drawImage(keep, 0, 0);
  const img = kc.getImageData(0, 0, W, VEIL);
  applyTain(img.data);
  kc.putImageData(img, 0, 0);
  c.drawImage(k, 0, 0);
  // Hollow Granary: the stores are gone; only their outlines remain.
  let x = span('granary').x0;
  let y = top('granary');
  R(c, x + 2, y + 8, 36, 10, UMBRA[2]);
  for (let i = 0; i < 3; i++) ring(c, x + 4 + i * 5, y + 15, 2, UMBRA[3]);
  for (let i = 0; i < 3; i++) ring(c, x + 19 + i * 5, y + 15, 2, UMBRA[3]);
  for (const dy of [0, 7]) R(c, x + 30, y + 10 + dy, 6, 1, UMBRA[3]);
  // Waking Room: the slab glows.
  x = span('crypt').x0;
  y = top('crypt');
  R(c, x + 4, y + 14, 14, 1, UMBRA[6]);
  // Silvering: a pool of quicksilver under the bench.
  x = span('glazier').x0;
  y = top('glazier');
  R(c, x + 15, y + 17, 13, 1, UMBRA[7]);
  R(c, x + 17, y + 16, 9, 1, UMBRA[6]);
  // Threshold: a door of pale light in the far wall.
  x = span('infirmary').x0;
  y = top('infirmary');
  R(c, x + 28, y + 5, 4, 13, UMBRA[5]);
  R(c, x + 29, y + 6, 2, 12, UMBRA[7]);
  // The rifts on the deepest floor.
  for (const rf of MAP.rifts) {
    const fy = feet(DEEP_FLOOR);
    let rx = rf.x;
    for (let yy = fy + 1; yy > fy - 14; yy--) {
      D(c, rx, yy, '#3e1030');
      if (yy % 3 === 0) D(c, rx, yy, P.hot);
      if (yy % 4 === 0) rx += MF(rnd() * 3) - 1;
    }
    R(c, rf.x - 3, fy, 7, 2, '#050308');
  }
  return cv;
}

function nightKeepLayer(L) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
  c.drawImage(L.sky.night, 0, 0);
  c.drawImage(L.keep, 0, 0);
  A(c, 0.62, () => R(c, 0, 20, W, VEIL - 20, '#0b0d26'));
  const h = span('hearth');
  clip(c, h.x0, top('hearth'), h.x1 - h.x0, ROOM_H, () => glow(c, h.x0 + 38, feet(VEIL_FLOOR) - 4, 16, P.amber, 0.5));
  return cv;
}

let cache = null;
function layers() {
  if (cache) return cache;
  const rnd = rngOf(20260926);
  const keep = keepLayer(rnd);
  cache = { keep, sky: { day: skyLayer('day', rnd), sunset: skyLayer('sunset', rnd), night: skyLayer('night', rnd) }, tain: tainLayer(keep, rnd) };
  cache.nightKeep = nightKeepLayer(cache);
  return cache;
}

/* ---------------------------------------------------------------- the day */

const JOB_LOOK = {
  chapel: { body: P.bone, hood: P.bone, robe: 1 },
  glazier: { body: P.navy, trim: P.bone },
  chandlery: { body: P.tan, trim: P.brown },
  infirmary: { body: P.white, trim: P.red, robe: 1 },
  barracks: { body: P.steel, helm: P.silver, spear: 1 },
  hearth: { body: P.clay, trim: P.bone },
  none: { body: P.slate },
};
const HAIR = [P.brown, P.plum, P.tan, P.earth, P.rust];

function person(c, p, i, x, y, t, dim = 0) {
  const look = JOB_LOOK[p.job || 'none'];
  const hair = p.age === 'old' ? P.silver : HAIR[(p.name.charCodeAt(0) + p.name.length) % HAIR.length];
  const skin = p.sick > 0 ? '#a9c79a' : [P.peach, P.skin2, P.tan][p.name.charCodeAt(1) % 3];
  const o = { ...look, hair: look.hood || look.helm ? undefined : hair, skin, h: p.age === 'young' ? 7 : 8, ph: i, walk: p.sick > 0 ? 0 : 2, face: i % 2 ? -1 : 1 };
  A(c, 1 - dim, () => human(c, Math.round(x), y, o, t));
  if (p.grief) D(c, Math.round(x) + 3, y - o.h - 1, P.blue);
}

// The keep by day, the living at work. `sunset` (0 to 1) warms the sky toward dusk.
function composeDay(c, s, t, sunset) {
  const L = layers();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, VIEW_H);
  c.drawImage(L.sky.day, 0, 0);
  if (sunset > 0) A(c, sunset, () => c.drawImage(L.sky.sunset, 0, 0));
  c.drawImage(L.keep, 0, 0);
  if (sunset > 0) A(c, 0.25 * sunset, () => R(c, 0, 0, W, VEIL, P.orange));
  const h = span('hearth');
  const hy = feet(VEIL_FLOOR);
  glow(c, h.x0 + 38, hy - 3, 6, P.orange, 0.25);
  flame(c, h.x0 + 38, hy - 1, t, 0);
  flame(c, h.x0 + 36, hy - 1, t + 0.4, 1);
  const g = span('glazier');
  flame(c, g.x0 + 7, feet(g.f) - 2, t, 2);
  // The living, spread across their rooms.
  const byRoom = {};
  for (const p of s.living) (byRoom[p.job || 'hearth'] ||= []).push(p);
  for (const [id, ps] of Object.entries(byRoom)) {
    const { f, x0, x1 } = span(id);
    const n = ps.length;
    ps.forEach((p, i) => {
      const home = x0 + 4 + ((i + 0.5) * (x1 - x0 - 12)) / n;
      const x = home + (p.sick > 0 ? 0 : Math.sin(t * 0.5 + i * 1.7 + p.name.length) * 3);
      person(c, p, i, x, feet(f), t);
    });
  }
  // The dead wait in the crypt.
  const cr = span('crypt');
  s.bodies.slice(0, 4).forEach((b, i) => {
    const y = top('crypt') + 12 - (i % 2) * 0;
    const x = cr.x0 + 5 + i * 3;
    if (i === 0) {
      R(c, x, y, 11, 2, P.bone);
      R(c, x - 1, y, 2, 2, P.peach);
    } else {
      R(c, x + 16 + i * 5, feet(cr.f) - 1, 5, 1, P.bone);
      D(c, x + 15 + i * 5, feet(cr.f) - 1, P.peach);
    }
  });
  // The Lantern Church's inspector, on the day of a visit.
  if (s.inspection && s.inspection.day === s.day) {
    const ch = span('chapel');
    const x = ch.x0 + 8 + (s.inspection.done ? 0 : Math.sin(t * 0.4) * 4);
    human(c, Math.round(x), feet(ch.f), { body: P.ink, hood: P.ink, robe: 1, trim: P.amber, ph: 9 }, t);
    glow(c, Math.round(x) + 5, feet(ch.f) - 6, 4, P.yellow, 0.4);
    D(c, Math.round(x) + 5, feet(ch.f) - 6, P.yellow);
  }
  // A raid on the road: torches along the hills, closer as it comes; smoke after a breach.
  const r = s.raid;
  if (r && r.warned && r.state === 'coming') {
    const k = Math.max(0, Math.min(1, (s.t - r.warnAt) / Math.max(1, r.hitAt - r.warnAt)));
    for (let i = 0; i < Math.min(8, r.count); i++) {
      const x = W - 4 - (1 - k) * 2 - i * 5 * (1 - 0.6 * k);
      const y = 16 + (i % 2);
      D(c, Math.round(x), y, (MF(t * 6) + i) % 2 ? P.orange : P.yellow);
      D(c, Math.round(x), y + 1, P.crimson);
    }
  }
  if (r && r.state === 'breached') {
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 22 + Math.sin(t + i) * 2;
      const y = 18 - ((t * 3 + i * 5) % 14);
      A(c, 0.5, () => ellipse(c, x, y, 2, 1, P.slate));
    }
  }
  // The moat, with the keep's reflection.
  R(c, 0, VEIL, W, VIEW_H - VEIL, '#1a1826');
  for (let i = 0; i < VIEW_H - VEIL; i++) {
    const dx = Math.round(Math.sin(t * 2 + i * 0.9) * (i > 2 ? 1 : 0));
    A(c, 0.45, () => c.drawImage(c.canvas, 0, VEIL - 1 - i, W, 1, dx, VEIL + i, W, 1));
  }
  R(c, 0, VEIL, W, 1, P.steel);
}

/* ---------------------------------------------------------------- the night */

const EYES = { loyal: P.cyan, serene: '#cfe0ff', pale: P.white, stranger: P.green };
const SHADE_BODY = { pale: ['#4a4466', '#5a5478'] };

function shadeSprite(c, d, x, y, t) {
  const [body, skin] = SHADE_BODY[d.kind] || ['#07060d', '#07060d'];
  human(c, Math.round(x - 2), Math.round(y), { body, skin, legs: body, hood: d.kind === 'serene' ? body : undefined, ph: x, walk: d.path?.length ? 3 : 0 }, t);
}
function shadeEyes(c, d, x, y) {
  const col = EYES[d.kind] || P.cyan;
  D(c, Math.round(x - 1), Math.round(y) - 7, col);
  D(c, Math.round(x), Math.round(y) - 7, col);
}
function creeperSprite(c, u, x, y, t) {
  const bx = Math.round(x - 3);
  const by = Math.round(y);
  const bob = u.climb ? 0 : Math.round(Math.sin(t * 4 + u.x));
  R(c, bx, by - 3 + bob, 7, 3, '#050308');
  D(c, bx - 1, by - 1 + bob, '#050308');
  D(c, bx + 7, by - 1 + bob, '#050308');
  for (let i = 0; i < 3; i++) D(c, bx + 1 + i * 2, by + bob, (MF(t * 8) + i) % 2 ? '#050308' : '#1a0d1a');
  if (u.temper === 'snuff') D(c, bx + 3, by - 4 + bob, '#050308');
}
function creeperEyes(c, u, x, y, t) {
  const bx = Math.round(x - 3);
  const bob = u.climb ? 0 : Math.round(Math.sin(t * 4 + u.x));
  const col = u.gnawing ? P.orange : P.hot;
  D(c, bx + 2, Math.round(y) - 2 + bob, col);
  D(c, bx + 4, Math.round(y) - 2 + bob, col);
}
function wraithSprite(c, x, y, t) {
  const bx = Math.round(x - 3);
  const by = Math.round(y);
  const sway = Math.round(Math.sin(t * 3 + x) * 1);
  R(c, bx + 1 + sway, by - 11, 5, 3, '#020104');
  R(c, bx, by - 8, 7, 6, '#020104');
  for (let i = 0; i < 4; i++) D(c, bx + i * 2, by - 2 + ((MF(t * 6) + i) % 2), '#020104');
}
function wraithEyes(c, x, y, t) {
  const bx = Math.round(x - 3) + Math.round(Math.sin(t * 3 + x));
  D(c, bx + 2, Math.round(y) - 10, P.white);
  D(c, bx + 4, Math.round(y) - 10, P.white);
}
function hollowSprite(c, x, y, t) {
  const cx = Math.round(x);
  const cy = Math.round(y) - 6;
  ellipse(c, cx, cy, 7, 6, '#000000');
  for (let i = 0; i < 10; i++) {
    const a = t * 0.8 + (i / 10) * Math.PI * 2;
    D(c, cx + Math.round(Math.cos(a) * 8), cy + Math.round(Math.sin(a) * 6), '#000000');
  }
}
function hollowEyes(c, x, y, t) {
  const cx = Math.round(x);
  const cy = Math.round(y) - 6;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * 0.3;
    D(c, cx + Math.round(Math.cos(a) * 3), cy + Math.round(Math.sin(a) * 2), MF(t * 2 + i) % 3 ? P.hot : P.red);
  }
}
function candleStick(c, k) {
  const h = 1 + Math.ceil((3 * Math.max(0, k.wax)) / k.max);
  R(c, Math.round(k.x), feet(k.f) - h + 1, 1, h, UMBRA[6]);
  return feet(k.f) - h;
}
function sigil(c, x, y, hold) {
  const col = hold != null && hold < 6 ? P.hot : '#f0b0ff';
  ring(c, x, y, 3, col);
  D(c, x, y, col);
  D(c, x, y - 2, col);
  D(c, x, y + 2, col);
}

const work = typeof document !== 'undefined' ? mk(W, VEIL) : null;

// Light as the renderer sees it: exactly the simulation's lit spans on each floor, with a short dithered
// falloff outside them, and the Hollow swallowing what's around it.
function lightFor(s, hollow, ambient) {
  const L = lightMap(s.tuning, s.night?.candles || []);
  return (x, y) => {
    let f = -1;
    for (let i = 0; i < FLOORS.length; i++) if (y >= FLOORS[i].y && y < FLOORS[i].y + ROOM_H) f = i;
    if (f < 0) return ambient * 0.8;
    let d = Infinity;
    for (const [a, b] of L.merged[f]) d = Math.min(d, x < a ? a - x : x > b ? x - b : 0);
    let v = Math.max(ambient, 1 - d / 5);
    if (hollow && f === hollow.f) v *= Math.min(1, Math.abs(x - hollow.x) / 10 + 0.3);
    return v;
  };
}

// The Tain upright, lit, with everything in it. opts: alpha (between ticks), selected (shade id),
// ghost ({ f, x, tool }) for the candle or ward preview, still (no animation).
function composeTain(s, t, opts = {}) {
  const L = layers();
  const c = ctxOf(work);
  const n = s.night;
  const alpha = opts.alpha ?? 1;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, VEIL);
  c.drawImage(L.tain, 0, 0);
  const ch = span('chapel');
  ring(c, ch.x0 + 29, top('chapel') + 8, 4 + (MF(t * 3) % 3), UMBRA[5], (dx, dy) => dy < 0);
  const candles = n?.candles || [];
  const flames = candles.map((k) => ({ k, y: candleStick(c, k) }));
  if (opts.ghost?.tool === 'candle') R(c, Math.round(opts.ghost.x), feet(opts.ghost.f) - 3, 1, 3, UMBRA[7]);
  const shades = s.shades.filter((d) => d.mirror && d.kind !== 'wraith' && d.kind !== 'restless');
  const shadePos = shades.map((d) => ({ d, ...unitAt(d, alpha) }));
  for (const { d, x, y } of shadePos) shadeSprite(c, d, x, y, t);
  const foes = (n?.foes || []).map((u) => ({ u, ...unitAt(u, alpha) }));
  for (const { u, x, y } of foes) {
    if (u.type === 'creeper') creeperSprite(c, u, x, y, t);
    else if (u.type === 'wraith') wraithSprite(c, x, y, t);
    else hollowSprite(c, x, y, t);
  }
  const hollow = foes.find((f) => f.u.type === 'hollow');
  const img = c.getImageData(0, 0, W, VEIL);
  applyLight(img.data, W, VEIL, lightFor(s, hollow && !hollow.u.climb ? { f: hollow.u.f, x: hollow.x } : null, opts.ambient ?? 0.2));
  c.putImageData(img, 0, 0);

  // What gives off its own light goes on after the lighting.
  const h = span('hearth');
  flame(c, h.x0 + 38, feet(VEIL_FLOOR) - 1, t, 3, [P.cyan, '#9fe6ff', P.blue]);
  flame(c, h.x0 + 36, feet(VEIL_FLOOR) - 1, t + 0.3, 5, [P.cyan, '#9fe6ff', P.blue]);
  const wk = span('chandlery');
  for (let i = 0; i < 3; i++) flame(c, wk.x0 + 3 + i * 4, top('chandlery') + 9 + Math.round(Math.sin(t * 2 + i)), t, i, [P.cyan, '#9fe6ff', P.blue]);
  for (const rf of MAP.rifts) {
    const pulse = 0.25 + 0.2 * Math.sin(t * 2 + rf.x);
    glow(c, rf.x, feet(DEEP_FLOOR) - 2, 5, P.hot, pulse);
  }
  // The mirrors under the Veil, where the Unlit are headed: always bright enough to find.
  for (const m of MAP.mirrors) {
    const my = FLOORS[VEIL_FLOOR].y + 4;
    glow(c, m.x, my + 3, 5, '#f0b0ff', 0.2 + 0.08 * Math.sin(t * 1.5 + m.x));
    R(c, m.x - 2, my, 5, 7, P.mauve);
    R(c, m.x - 1, my + 1, 3, 5, UMBRA[7]);
    D(c, m.x - 1, my + 1, P.white);
  }
  flames.forEach(({ k, y }, i) => {
    glow(c, Math.round(k.x), y - 1, 3, P.amber, 0.25);
    flame(c, Math.round(k.x), y, t, i);
  });
  for (const w of n?.wards || []) {
    const st = MAP.stairs.find((x) => x.id === w);
    if (st) {
      sigil(c, st.x, feet(st.f) - 6, n.wardHold?.[w]);
      sigil(c, st.x, feet(st.f + 1) - 6, n.wardHold?.[w]);
    } else {
      const rf = MAP.rifts.find((x) => x.id === w);
      if (rf) sigil(c, rf.x, feet(DEEP_FLOOR) - 6);
    }
  }
  if (opts.ghost?.tool === 'ward' && opts.ghost.target) {
    const g = opts.ghost.target;
    A(c, 0.6, () => sigil(c, g.x, feet(g.f) - 6));
  }
  // Every shade carries a faint glow of its own, so a silhouette in the dark can still be found.
  for (const { d, x, y } of shadePos) {
    glow(c, Math.round(x), Math.round(y) - 4, 5, '#7d6bd6', 0.3);
    shadeSprite(c, d, x, y, t);
  }
  for (const { d, x, y } of shadePos) {
    shadeEyes(c, d, x, y);
    if (d.grabbedBy && MF(t * 4) % 2) R(c, Math.round(x) - 3, Math.round(y) - 10, 6, 1, P.hot);
    if (d.named) D(c, Math.round(x) + 1, Math.round(y) - 4, P.amber);
    const m = Math.max(0, Math.min(4, Math.ceil(d.memory / 25)));
    if (opts.selected === d.id || d.memory < 40) {
      R(c, Math.round(x) - 2, Math.round(y) - 11, 4, 1, UMBRA[2]);
      R(c, Math.round(x) - 2, Math.round(y) - 11, m, 1, d.memory < 40 ? P.hot : UMBRA[7]);
    }
    if (opts.selected === d.id) {
      const bx = Math.round(x);
      const by = Math.round(y) - 14;
      D(c, bx, by + 1, P.yellow);
      R(c, bx - 1, by, 3, 1, P.yellow);
    }
  }
  for (const { u, x, y } of foes) {
    if (u.type === 'creeper') creeperEyes(c, u, x, y, t);
    else if (u.type === 'wraith') wraithEyes(c, x, y, t);
    else hollowEyes(c, x, y, t);
  }
  // The Restless wait at the edge of the Deep, flickering by the rifts.
  const restless = s.shades.filter((d) => d.kind === 'restless');
  restless.forEach((d, i) => {
    const rf = MAP.rifts[i % MAP.rifts.length];
    const x = rf.x + (i % 2 ? 5 : -5) + Math.round(Math.sin(t * 1.3 + i) * 2);
    if (MF(t * 5 + i) % 4) {
      D(c, x, feet(DEEP_FLOOR) - 7, P.silver);
      D(c, x + 1, feet(DEEP_FLOOR) - 7, P.silver);
      A(c, 0.35, () => R(c, x - 1, feet(DEEP_FLOOR) - 8, 4, 7, '#cfe0ff'));
    }
  });
  return work;
}

const viewBuf = typeof document !== 'undefined' ? mk(W, VIEW_H) : null;

function output(out, mode) {
  const o = ctxOf(out);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, out.width, out.height);
  if (mode === 'flipped') o.setTransform(1, 0, 0, -1, 0, VIEW_H);
  o.drawImage(viewBuf, 0, 0);
  o.setTransform(1, 0, 0, 1, 0, 0);
}

// A night (or dusk, or dawn) in the Tain as the chosen camera shows it. `out` is W x VIEW_H.
export function drawNight(out, s, mode, t, opts = {}) {
  const tain = composeTain(s, t, opts);
  const v = ctxOf(viewBuf);
  v.setTransform(1, 0, 0, 1, 0, 0);
  v.clearRect(0, 0, W, VIEW_H);
  v.drawImage(layers().nightKeep, 0, VEIL - 8, W, 8, 0, 0, W, 8);
  v.setTransform(1, 0, 0, -1, 0, VIEW_H);
  v.drawImage(tain, 0, 0);
  v.setTransform(1, 0, 0, 1, 0, 0);
  R(v, 0, 7, W, 1, P.mauve);
  if (opts.veilFlash > 0) A(v, opts.veilFlash, () => R(v, 0, 6, W, 3, P.hot));
  output(out, mode);
}

export function drawDay(out, s, t, sunset = 0) {
  composeDay(ctxOf(viewBuf), s, t, sunset);
  output(out, 'day');
}

// Room-name tags for the overlay: where each room's label sits in view pixels, on the side of the room
// nobody stands on (the ceiling), so a label never covers a shade's feet.
export function labelSpots(view, mode) {
  const out = [];
  for (let f = 0; f < FLOORS.length; f++) {
    for (const [id, a, b] of FLOORS[f].rooms) {
      const cx = (a + b) / 2;
      if (view === 'night' && mode === 'reflection') out.push({ id, x: cx, y: toView(mode, cx, FLOORS[f].y).y, below: true });
      else out.push({ id, x: cx, y: FLOORS[f].y + 1, below: false });
    }
  }
  return out;
}
