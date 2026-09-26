// Draws the season slice as one world that fills the screen: the keep on its lake under a wide sky by day,
// and by night the dark keep above the Veil with the Tain below it, the keep's reflection made from the
// same art by the palette lookup, lit by the simulation's own candlelight, with the shades, the Unlit and
// the Hollow in it. Browser only (canvas). Geometry comes from geo.js; the camera from the page.

import { P, MF, rngOf, R, D, A, clip, bricks, crenel, roof, ellipse, ring, room as paintRoom, flame, glow, human } from '../px/kit.js';
import { UMBRA, applyTain, applyLight } from '../px/lut.js';
import { MAP, DEEP_FLOOR, VEIL_FLOOR } from './data.js';
import { FLOORS, feet, roomSpan, lightMap, unitAt } from './geo.js';
import { figure, livingLook, shadeLook, eyesAt, FIG_H } from './people.js';

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

// The Tain upright: the keep through the palette lookup, over the Deep, with each twin's own details.
function tainLayer(keep, rnd) {
  const cv = mk(W, VEIL);
  const c = ctxOf(cv);
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
  c.drawImage(L.keep, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  A(c, 0.62, () => R(c, 0, 0, W, VEIL, '#0b0d26'));
  c.globalCompositeOperation = 'source-over';
  for (const [x, y] of [[50, 11], [60, 11]]) R(c, x, y, 2, 3, P.yellow);
  const h = span('hearth');
  clip(c, h.x0, top('hearth'), h.x1 - h.x0, ROOM_H, () => glow(c, h.x0 + 38, feet(VEIL_FLOOR) - 4, 16, P.amber, 0.5));
  return cv;
}

let cache = null;
function layers() {
  if (cache) return cache;
  const rnd = rngOf(20260926);
  const keep = keepLayer(rnd);
  cache = { keep, tain: tainLayer(keep, rnd) };
  cache.nightKeep = nightKeepLayer(cache);
  return cache;
}

/* ---------------------------------------------------------------- the world around the keep */

// Skies as colour stops by world row (the keep's top is row 0, the lake is row VEIL), dithered at the seams.
const DAY_SKY = [[-9999, '#2f63c4'], [-150, '#3b7dd8'], [-60, '#5a9be6'], [10, '#86bff0'], [64, '#bfe1f6']];
const SUNSET_SKY = [[-9999, P.indigo], [-120, P.grape], [-30, P.mauve], [30, P.pink], [70, P.amber]];
const NIGHT_SKY = [[-9999, '#07060d'], [-120, P.void], [-30, P.night], [40, P.ink], [84, P.indigo]];
// The Tain's own sky, by upright row: the deeper, the darker.
const TAIN_SKY = [[-9999, '#040308'], [-60, '#07050c'], [0, '#0e0b18'], [36, '#150f28'], [72, '#1b1430']];

function bands(c, x0, w, y0, y1, stops) {
  for (let i = 0; i < stops.length; i++) {
    const a = Math.max(y0, stops[i][0]);
    const b = Math.min(y1, i + 1 < stops.length ? stops[i + 1][0] : y1);
    if (b > a) R(c, x0, a, w, b - a, stops[i][1]);
  }
  for (let i = 1; i < stops.length; i++) {
    const y = stops[i][0];
    if (y <= y0 || y >= y1) continue;
    for (let x = MF(x0); x < x0 + w; x++) {
      if ((x & 1) === 0) D(c, x, y - 1, stops[i][1]);
      else D(c, x, y, stops[i - 1][1]);
    }
  }
}

// Two ridges of hills behind the keep, meeting the lake. Heights are a function of world x only.
const RIDGES = { far: { base: VEIL - 10, amp: 36, seed: 1.7 }, near: { base: VEIL, amp: 18, seed: 4.2 } };
export function ridgeTop(x, r) {
  const v = 0.5 + 0.3 * Math.sin(x * 0.045 + r.seed) + 0.14 * Math.sin(x * 0.11 + r.seed * 2) + 0.07 * Math.sin(x * 0.31 + r.seed * 3);
  return Math.round(r.base - r.amp * v);
}
function ridge(c, x0, w, r, col, y1 = VEIL) {
  c.fillStyle = col;
  for (let x = MF(x0); x < x0 + w; x++) {
    const top = ridgeTop(x, r);
    if (top < y1) c.fillRect(x, top, 1, y1 - top);
  }
}

// Stars and clouds repeat on tiles, so any width of sky has them.
const STAR_TILE = 211;
const STARS = (() => {
  const rnd = rngOf(1861);
  return Array.from({ length: 34 }, () => [MF(rnd() * STAR_TILE), MF(-240 + rnd() * 300), rnd()]);
})();
function stars(c, x0, w, y0, y1, t, col = P.white) {
  const k0 = Math.floor(x0 / STAR_TILE);
  for (let k = k0; k * STAR_TILE < x0 + w; k++) {
    for (const [sx, sy, ph] of STARS) {
      const x = k * STAR_TILE + sx;
      if (x < x0 || x >= x0 + w || sy < y0 || sy >= y1) continue;
      if (ph > 0.8 && MF(t * 1.5 + ph * 10) % 5 === 0) continue;
      D(c, x, sy, col);
    }
  }
}
const CLOUD_TILE = 173;
const CLOUDS = [[12, -26, 5], [19, -28, 4], [96, -8, 4], [103, -10, 5], [58, -70, 6], [140, -44, 4]];
function clouds(c, x0, w, t) {
  const drift = (t * 0.6) % CLOUD_TILE;
  const k0 = Math.floor((x0 - drift) / CLOUD_TILE) - 1;
  for (let k = k0; k * CLOUD_TILE + drift < x0 + w + 20; k++) {
    for (const [cx, cy, r] of CLOUDS) {
      const x = k * CLOUD_TILE + cx + drift;
      if (x + r < x0 || x - r > x0 + w) continue;
      ellipse(c, x, cy, r, MF(r / 2) + 1, P.white);
    }
  }
}

/* ---------------------------------------------------------------- the day */

// One of the living at work. Each keeps a station in their room and works it (guards stand to), and now
// and then walks a few steps out and back; the idle wander more. All of it runs off the clock, so it holds
// no state. The sick stay put.
function person(c, p, i, home, y, t, dim = 0) {
  const look = livingLook(p);
  const cyc = (t * 0.1 + i * 0.37 + (p.name.length % 7) * 0.13) % 1;
  const walkFrom = p.job ? 0.72 : 0.35;
  let face = i % 2 ? -1 : 1;
  let x = home;
  let pose = p.job && p.job !== 'barracks' ? 'work' : 'stand';
  if (!(p.sick > 0) && cyc > walkFrom) {
    const k = (cyc - walkFrom) / (1 - walkFrom);
    x = home + (k < 0.5 ? k * 2 : (1 - k) * 2) * (p.job ? 5 : 9) * face;
    if (k >= 0.5) face = -face;
    pose = 'walk';
  }
  A(c, 1 - dim, () => figure(c, Math.round(x), y, { ...look, pose, face, ph: i * 1.7 }, t));
  if (p.grief) D(c, Math.round(x), y - FIG_H[look.age] - 3, P.blue);
}

// Everything alive in the keep by day, in world coordinates: fires, the living at work, the dead in the
// crypt, the Church's inspector, and a raid coming over the hills.
function dayActors(c, s, t, dusk = 0) {
  const h = span('hearth');
  const hy = feet(VEIL_FLOOR);
  glow(c, h.x0 + 38, hy - 3, 6, P.orange, 0.25);
  flame(c, h.x0 + 38, hy - 1, t, 0);
  flame(c, h.x0 + 36, hy - 1, t + 0.4, 1);
  const g = span('glazier');
  flame(c, g.x0 + 7, feet(g.f) - 2, t, 2);
  const byRoom = {};
  for (const p of s.living) (byRoom[p.job || 'hearth'] ||= []).push(p);
  for (const [id, ps] of Object.entries(byRoom)) {
    const { f, x0, x1 } = span(id);
    const n = ps.length;
    ps.forEach((p, i) => {
      const home = x0 + 6 + ((i + 0.5) * (x1 - x0 - 14)) / n;
      person(c, p, i, home, feet(f), t, Math.min(1, dusk * 1.6));
    });
  }
  const cr = span('crypt');
  // At dusk the dead on the slab glow faintly, the only light left in the crypt.
  if (dusk > 0 && s.bodies.length) glow(c, cr.x0 + 11, top('crypt') + 12, 7, '#cfe0ff', 0.25 * dusk);
  s.bodies.slice(0, 4).forEach((b, i) => {
    if (i === 0) {
      R(c, cr.x0 + 5, top('crypt') + 12, 11, 2, P.bone);
      R(c, cr.x0 + 4, top('crypt') + 12, 2, 2, P.peach);
    } else {
      R(c, cr.x0 + 21 + i * 8, feet(cr.f) - 1, 5, 1, P.bone);
      D(c, cr.x0 + 20 + i * 8, feet(cr.f) - 1, P.peach);
    }
  });
  if (s.inspection && s.inspection.day === s.day) {
    const ch = span('chapel');
    const x = Math.round(ch.x0 + 10 + (s.inspection.done ? 0 : Math.sin(t * 0.4) * 4));
    const walking = !s.inspection.done && Math.abs(Math.cos(t * 0.4)) > 0.3;
    figure(c, x, feet(ch.f), {
      tunic: P.ink, legs: P.ink, belt: P.amber, shoes: P.night, skin: P.peach, hair: P.night, robe: 1, hood: P.ink, prop: 'lantern',
      pose: walking ? 'walk' : 'stand', face: Math.cos(t * 0.4) >= 0 ? 1 : -1, ph: 9,
    }, t);
  }
  // A raid on the way: war banners on the turrets, and the Host's torches coming over the eastern hills.
  const r = s.raid;
  if (r && r.warned && r.state === 'coming') {
    const k = Math.max(0, Math.min(1, (s.t - r.warnAt) / Math.max(1, r.hitAt - r.warnAt)));
    // War banners over the turrets: the one warning you can see from anywhere.
    for (const x of [4, 108]) {
      const wave = MF(t * 4 + x) % 2;
      R(c, x, -8, 1, 11, P.brown);
      R(c, x + 1, -8, 5, 2, P.red);
      R(c, x + 1, -6, 4 + wave, 2, P.red);
      D(c, x + 5 + wave, -6, P.orange);
    }
    for (let i = 0; i < Math.min(10, r.count); i++) {
      const x = Math.round(W + 4 + (1 - k) * 36 + i * 6);
      const y = ridgeTop(x, RIDGES.near) - 1;
      human(c, x - 1, y + 1, { body: P.crimson, helm: P.slate, h: 6, walk: 3, ph: i }, t);
      D(c, x + 3, y - 6, (MF(t * 6) + i) % 2 ? P.orange : P.yellow);
    }
  }
  if (r && r.state === 'breached' && dusk < 1) {
    for (let i = 0; i < 5; i++) {
      const x = 10 + i * 22 + Math.sin(t + i) * 2;
      const y = 16 - ((t * 3 + i * 5) % 18);
      A(c, 0.5 * (1 - dusk), () => ellipse(c, x, y, 2, 1, P.slate));
    }
  }
}

/* ---------------------------------------------------------------- the night */


// A shade faces the way it's going, or inward from its post.
function shadeFigure(d, x) {
  const next = d.path?.[0];
  const face = next && Math.abs(next.x - x) > 0.5 ? (next.x > x ? 1 : -1) : x < W / 2 ? 1 : -1;
  return { ...shadeLook(d), face, pose: d.path?.length ? 'walk' : 'stand', ph: d.id.charCodeAt(1) || 0 };
}
function shadeSprite(c, d, x, y, t) {
  figure(c, Math.round(x), Math.round(y), shadeFigure(d, x), t);
}
function shadeEyes(c, d, x, y, t) {
  const o = shadeFigure(d, x);
  const bob = o.pose === 'walk' ? MF(t * 3 + o.ph) % 2 : 0;
  for (const e of eyesAt(Math.round(x), Math.round(y) - bob, o)) D(c, e.x, e.y, o.eyes);
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
// A Maw: a hunched brute, wider and taller than a Creeper, with a mouth that opens as it tears at a candle.
function mawSprite(c, u, x, y, t) {
  const bx = Math.round(x - 4);
  const by = Math.round(y);
  const step = u.climb ? 0 : MF(t * 3 + u.x) % 2;
  const col = '#040206';
  R(c, bx + 2, by - 9, 5, 2, col);
  R(c, bx, by - 7, 9, 5, col);
  R(c, bx + 1, by - 2, 2, 2 - step, col);
  R(c, bx + 6, by - 2, 2, 1 + step, col);
  R(c, bx - 1, by - 6, 1, 4, col);
  R(c, bx + 9, by - 6, 1, 4, col);
}
function mawEyes(c, u, x, y, t) {
  const bx = Math.round(x - 4);
  const by = Math.round(y);
  D(c, bx + 3, by - 8, P.orange);
  D(c, bx + 5, by - 8, P.orange);
  const open = u.gnawing ? MF(t * 8) % 2 : 0;
  R(c, bx + 2, by - 5, 5, 1 + open, u.gnawing ? P.hot : P.crimson);
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
    else if (u.type === 'maw') mawSprite(c, u, x, y, t);
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
    glow(c, Math.round(x), Math.round(y) - 6, 6, '#7d6bd6', 0.3);
    shadeSprite(c, d, x, y, t);
  }
  for (const { d, x, y } of shadePos) {
    shadeEyes(c, d, x, y, t);
    const hh = FIG_H[shadeLook(d).age];
    const bx = Math.round(x);
    const by = Math.round(y);
    if (d.grabbedBy && MF(t * 4) % 2) R(c, bx - 3, by - 7, 6, 1, P.hot);
    if (d.named) D(c, bx, by - hh + 5, P.amber);
    const m = Math.max(0, Math.min(4, Math.ceil(d.memory / 25)));
    if (opts.selected === d.id || d.memory < 40) {
      R(c, bx - 2, by - hh - 3, 4, 1, UMBRA[2]);
      R(c, bx - 2, by - hh - 3, m, 1, d.memory < 40 ? P.hot : UMBRA[7]);
    }
    if (opts.selected === d.id) {
      D(c, bx, by - hh - 5, P.yellow);
      R(c, bx - 1, by - hh - 6, 3, 1, P.yellow);
    }
  }
  for (const { u, x, y } of foes) {
    if (u.type === 'creeper') creeperEyes(c, u, x, y, t);
    else if (u.type === 'wraith') wraithEyes(c, x, y, t);
    else if (u.type === 'maw') mawEyes(c, u, x, y, t);
    else hollowEyes(c, x, y, t);
  }
  // Guide marks: pulsing rings on the spots a guide card is talking about.
  for (const m of opts.marks || []) {
    const r = 5 + (MF(t * 4) % 3);
    ring(c, Math.round(m.x), feet(m.f) - 5, r, P.yellow);
    ring(c, Math.round(m.x), feet(m.f) - 5, r + 1, P.amber, (dx, dy) => (dx + dy) % 2 === 0);
  }
  // The Restless wait at the edge of the Deep, flickering by the rifts.
  const restless = s.shades.filter((d) => d.kind === 'restless');
  restless.forEach((d, i) => {
    const rf = MAP.rifts[i % MAP.rifts.length];
    const x = rf.x + (i % 2 ? 5 : -5) + Math.round(Math.sin(t * 1.3 + i) * 2);
    if (MF(t * 5 + i) % 4) {
      const o = { silhouette: '#cfe0ff', wisp: true, pose: 'stand', face: i % 2 ? -1 : 1 };
      A(c, 0.35, () => figure(c, x, feet(DEEP_FLOOR), o, t));
      for (const e of eyesAt(x, feet(DEEP_FLOOR), o)) D(c, e.x, e.y, P.silver);
    }
  });
  return work;
}


/* ---------------------------------------------------------------- composing the screen */

const scratch = {};
function buf(name, w, h) {
  let cv = scratch[name];
  if (!cv) cv = scratch[name] = mk(Math.max(1, w), Math.max(1, h));
  if (cv.width !== Math.max(1, w) || cv.height !== Math.max(1, h)) {
    cv.width = Math.max(1, w);
    cv.height = Math.max(1, h);
    ctxOf(cv);
  }
  return cv;
}

// The keep by day on its lake, the living at work, and the lake reflecting it all back.
function dayScene(c, w, h, s, v) {
  const L = layers();
  const { x: cx, y: cy } = v.cam;
  const t = v.t;
  const wet = Math.max(0, cy + h - VEIL);
  const yTop = Math.min(cy, VEIL - wet);
  const upH = Math.max(0, VEIL - yTop);
  if (upH > 0) {
    const up = buf('up', w, upH);
    const u = ctxOf(up);
    u.setTransform(1, 0, 0, 1, -cx, -yTop);
    u.clearRect(cx, yTop, w, upH);
    // Dusk (0 to 1) carries the keep from sunset into night: sky, hills and keep darken, the living go to bed.
    const dk = v.dusk || 0;
    const sunset = Math.max(v.sunset || 0, Math.min(1, dk * 2));
    bands(u, cx, w, yTop, VEIL, DAY_SKY);
    if (sunset > 0) A(u, sunset, () => bands(u, cx, w, yTop, VEIL, SUNSET_SKY));
    if (dk > 0.5) {
      A(u, (dk - 0.5) * 2, () => {
        bands(u, cx, w, yTop, VEIL, NIGHT_SKY);
        stars(u, cx, w, yTop, VEIL - 30, t);
      });
    }
    A(u, 1 - dk, () => clouds(u, cx, w, t));
    ridge(u, cx, w, RIDGES.far, sunset > 0.5 ? '#7a6a8a' : '#8fb4a4');
    ridge(u, cx, w, RIDGES.near, sunset > 0.5 ? '#5a4a6a' : '#6fa878');
    if (dk > 0) {
      A(u, dk, () => {
        ridge(u, cx, w, RIDGES.far, '#141c2a');
        ridge(u, cx, w, RIDGES.near, '#1a2430');
      });
    }
    u.drawImage(L.keep, 0, 0);
    if (dk > 0) A(u, dk, () => u.drawImage(L.nightKeep, 0, 0));
    if (sunset > 0 && dk < 0.6) A(u, 0.25 * sunset * (1 - dk / 0.6), () => R(u, cx, yTop, w, upH, P.orange));
    dayActors(u, s, t, dk);
    // Souls of the dead crossing: down through the Veil to wake, or up and away to rest.
    for (const sl of v.souls || []) {
      A(u, sl.a, () => {
        glow(u, Math.round(sl.x), Math.round(sl.y), 4, sl.up ? '#fff3c4' : '#cfe0ff', 0.55);
        R(u, Math.round(sl.x) - 1, Math.round(sl.y) - 1, 2, 3, P.white);
      });
    }
    c.drawImage(up, 0, yTop - cy);
    if (wet > 0) {
      const y0 = Math.max(VEIL, cy);
      R(c, 0, y0 - cy, w, cy + h - y0, '#1a2a3e');
      for (let wy = y0; wy < cy + h; wy++) {
        const i = wy - VEIL;
        const sy = VEIL - 1 - i;
        if (sy < yTop) break;
        const dx = Math.round(Math.sin(t * 2 + i * 0.9) * (i > 2 ? 1 : 0));
        c.globalAlpha = 0.55 - Math.min(0.3, i / 400);
        c.drawImage(up, 0, sy - yTop, w, 1, dx, wy - cy, w, 1);
      }
      c.globalAlpha = 1;
      A(c, 0.3 + 0.4 * dk, () => R(c, 0, y0 - cy, w, cy + h - y0, '#0e1826'));
      if (VEIL >= cy) {
        R(c, 0, VEIL - cy, w, 1, dk > 0.6 ? P.mauve : P.steel);
        if (v.veilFlash > 0) A(c, v.veilFlash, () => R(c, 0, VEIL - cy - 1, w, 3, '#f0b0ff'));
      }
    }
  }
}

// The night: the dark keep above the Veil and, below it, the Tain as the lake reflects it.
function nightScene(c, w, h, s, v) {
  const L = layers();
  const { x: cx, y: cy } = v.cam;
  const t = v.t;
  if (VEIL > cy) {
    c.setTransform(1, 0, 0, 1, -cx, -cy);
    bands(c, cx, w, cy, VEIL, NIGHT_SKY);
    stars(c, cx, w, cy, VEIL - 30, t);
    if (cy < -18) {
      ellipse(c, 22, -30, 3, 3, P.bone);
      ellipse(c, 23, -31, 2, 2, P.void);
    }
    ridge(c, cx, w, RIDGES.far, '#141c2a');
    ridge(c, cx, w, RIDGES.near, '#1a2430');
    c.drawImage(L.nightKeep, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  const below = cy + h - VEIL;
  if (below > 0) {
    // The rows under the Veil, as the upright Tain has them: world row wy is upright row 2 VEIL - 1 - wy.
    const rows = Math.min(below, h);
    const ky0 = 2 * VEIL - (cy + h);
    const un = buf('under', w, rows);
    const g = ctxOf(un);
    g.setTransform(1, 0, 0, 1, -cx, -ky0);
    g.clearRect(cx, ky0, w, rows);
    bands(g, cx, w, ky0, ky0 + rows, TAIN_SKY);
    stars(g, cx, w, ky0, Math.min(ky0 + rows, VEIL - 30), t, '#2a1d45');
    ridge(g, cx, w, RIDGES.far, '#211836');
    ridge(g, cx, w, RIDGES.near, '#2a1f44');
    g.drawImage(composeTain(s, t, v), 0, 0);
    c.setTransform(1, 0, 0, -1, 0, h);
    c.drawImage(un, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  const vy = VEIL - cy;
  if (vy >= 0 && vy < h) {
    R(c, 0, vy, w, 1, P.mauve);
    if (v.veilFlash > 0) A(c, v.veilFlash, () => R(c, 0, vy - 1, w, 3, P.hot));
  }
}

// Draws the world window that starts at v.cam (world pixels) into `out`, one canvas pixel per world
// pixel. v: { night, flip, cam: { x, y }, t, sunset, and composeTain's options }. With flip, the whole
// picture is turned over, so the Tain reads upright above the Veil.
export function drawScene(out, s, v) {
  const target = v.flip ? buf('flip', out.width, out.height) : out;
  const c = ctxOf(target);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.clearRect(0, 0, target.width, target.height);
  if (v.night) nightScene(c, target.width, target.height, s, v);
  else dayScene(c, target.width, target.height, s, v);
  if (v.flip) {
    const o = ctxOf(out);
    o.setTransform(1, 0, 0, -1, 0, out.height);
    o.clearRect(0, 0, out.width, out.height);
    o.drawImage(target, 0, 0);
    o.setTransform(1, 0, 0, 1, 0, 0);
  }
}
