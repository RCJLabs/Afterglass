// Draws the season slice as one world that fills the screen: the keep on its lake under a wide sky by day,
// and by night the dark keep above the Veil with the Tain below it, the keep's reflection made from the
// same art by the palette lookup, lit by the simulation's own candlelight, with the shades, the Unlit and
// the Hollow in it. Browser only (canvas). Geometry comes from geo.js; the camera from the page.

import { P, MF, rngOf, R, D, A, clip, bricks, crenel, roof, ellipse, ring, room as paintRoom, flame, glow, human } from '../px/kit.js';
import { UMBRA, applyTain, applyLight } from '../px/lut.js';
import { MAP, TICKS_PER_SEC } from './data.js';
import { geo, geoOf, feet as feetOf, roomSpan, roomsOf, lightMap, unitAt as unitAtOf } from './geo.js';
import { figure, livingLook, shadeLook, eyesAt, FIG_H } from './people.js';

const { W, VEIL, ROOM_H } = MAP;
// Today's weather (round five), as the sim has it: clear with the weather off.
const skyOf = (s) => (s.tuning.weather && s.weather) || 'clear';

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
  forge: ['#3e3436', P.soot], cellar: ['#3a3028', P.earth], empty: ['#55575f', P.slate], quarters: ['#4a4058', P.grape],
  library: ['#3f3a58', P.indigo], hall: ['#5a3a3a', P.plum], gatehouse: ['#4c4e58', P.slate], lampworks: ['#4e4636', P.brown],
};
// The keep being drawn: its geometry, set at the start of every frame (it grows as rooms are built).
let G = geoOf();
const feet = (f) => feetOf(G, f);
const unitAt = (u, a) => unitAtOf(G, u, a);
const span = (id) => roomSpan(G, id);
const top = (id) => G.floors[span(id).f].y;
const every = (type) => roomsOf(G, type);
// The keep's highest row: the flag on the roof, 24 rows above the top floor.
const roofY = () => G.top - 24;

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
  quarters(c, x, y) {
    for (let i = 0; i < 4; i++) {
      const bx = x + 3 + i * 11;
      R(c, bx, y + 15, 9, 3, P.brown);
      R(c, bx + 1, y + 14, 7, 2, i % 2 ? P.navy : P.indigo);
      R(c, bx + 6, y + 13, 2, 1, P.bone);
      R(c, bx, y + 12, 1, 6, P.clay);
    }
    R(c, x + 20, y + 4, 6, 5, P.ink);
    R(c, x + 21, y + 5, 4, 3, '#86bff0');
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
  hearth(c, x, y, f) {
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
    if (f === G.veil) mirrorFrame(c, MAP.mirrors[0].x - 2, y + 4);
  },
  forge(c, x, y) {
    // The forge fire under its hood, the anvil, a rack of blades and the quench tub.
    R(c, x + 4, y + 4, 9, 4, P.indigo);
    R(c, x + 3, y + 8, 11, 10, P.slate);
    R(c, x + 3, y + 8, 11, 1, P.steel);
    R(c, x + 5, y + 11, 7, 5, P.night);
    R(c, x + 6, y + 14, 5, 2, P.orange);
    D(c, x + 8, y + 13, P.yellow);
    R(c, x + 20, y + 13, 9, 2, P.steel);
    D(c, x + 28, y + 13, P.silver);
    R(c, x + 22, y + 15, 4, 3, P.slate);
    R(c, x + 33, y + 15, 11, 1, P.brown);
    for (let i = 0; i < 4; i++) {
      R(c, x + 34 + i * 3, y + 6, 1, 9, P.silver);
      D(c, x + 34 + i * 3, y + 15, P.brown);
    }
    R(c, x + 44, y + 13, 3, 5, P.brown);
    R(c, x + 44, y + 13, 3, 1, P.blue);
  },
  cellar(c, x, y) {
    // Barrels, stacked crates and a shelf of candle boxes and glass.
    for (let i = 0; i < 3; i++) {
      R(c, x + 2 + i * 7, y + 11, 6, 7, P.brown);
      R(c, x + 2 + i * 7, y + 13, 6, 1, P.clay);
      R(c, x + 2 + i * 7, y + 16, 6, 1, P.clay);
    }
    R(c, x + 25, y + 12, 8, 6, P.clay);
    R(c, x + 25, y + 12, 8, 1, P.tan);
    R(c, x + 27, y + 7, 6, 5, P.tan);
    D(c, x + 29, y + 9, P.brown);
    R(c, x + 37, y + 9, 9, 1, P.brown);
    for (let i = 0; i < 3; i++) R(c, x + 38 + i * 3, y + 7, 2, 2, i === 1 ? '#86bff0' : P.bone);
  },
  empty(c, x, y) {
    // Bare stone: scaffolding and a pile of cut blocks.
    for (const dx of [8, 38]) R(c, x + dx, y + 2, 1, 16, P.brown);
    R(c, x + 7, y + 9, 33, 1, P.clay);
    for (const [dx, dy] of [[18, 15], [23, 15], [28, 15], [20, 12], [25, 12]]) {
      R(c, x + dx, y + dy, 4, 3, P.steel);
      R(c, x + dx, y + dy, 4, 1, P.silver);
    }
  },
  crypt(c, x, y, f) {
    for (const [dx, dy] of [[2, 4], [2, 9], [7, 4], [30, 4], [30, 9]]) {
      R(c, x + dx, y + dy, 4, 3, P.night);
      D(c, x + dx + 1, y + dy + 1, P.bone);
    }
    R(c, x + 4, y + 14, 14, 4, P.slate);
    R(c, x + 4, y + 14, 14, 1, P.steel);
    if (f === G.veil) mirrorFrame(c, MAP.mirrors[1].x - 2, y + 4);
  },
  // Round six's three. The Library: shelves of books, and a reading desk with an open book and a candle.
  library(c, x, y) {
    for (const sx of [3, 16]) {
      R(c, x + sx, y + 4, 11, 13, P.brown);
      for (let row = 0; row < 3; row++) {
        R(c, x + sx, y + 8 + row * 4, 11, 1, P.clay);
        for (let i = 0; i < 9; i++) if ((i + row * 2 + sx) % 5) R(c, x + sx + 1 + i, y + 5 + row * 4, 1, 2 + ((i + row) % 2), [P.red, P.navy, P.green, P.amber, P.bone, P.plum][(i + row + sx) % 6]);
      }
    }
    R(c, x + 32, y + 13, 12, 1, P.clay);
    R(c, x + 33, y + 14, 1, 4, P.brown);
    R(c, x + 42, y + 14, 1, 4, P.brown);
    R(c, x + 35, y + 12, 3, 1, P.bone);
    R(c, x + 38, y + 12, 3, 1, P.white);
    R(c, x + 43, y + 10, 1, 3, P.bone);
    D(c, x + 43, y + 9, P.orange);
  },
  // The Hall: a banner, a long table set with cups, and the high seat at its head.
  hall(c, x, y) {
    R(c, x + 4, y + 3, 6, 9, P.crimson);
    R(c, x + 4, y + 3, 6, 1, P.amber);
    D(c, x + 7, y + 7, P.amber);
    R(c, x + 12, y + 13, 22, 1, P.clay);
    R(c, x + 13, y + 14, 1, 4, P.brown);
    R(c, x + 32, y + 14, 1, 4, P.brown);
    for (const dx of [16, 22, 28]) D(c, x + dx, y + 12, P.silver);
    R(c, x + 38, y + 6, 6, 12, P.amber);
    R(c, x + 39, y + 8, 4, 5, P.crimson);
    R(c, x + 38, y + 5, 6, 1, P.ochre);
  },
  // The Gatehouse: the portcullis and its winch, and a rack of spears.
  gatehouse(c, x, y) {
    R(c, x + 28, y + 2, 16, 16, P.night);
    for (let i = 0; i < 5; i++) R(c, x + 29 + i * 3, y + 2, 1, 15, P.steel);
    for (let j = 0; j < 4; j++) R(c, x + 28, y + 4 + j * 4, 16, 1, P.slate);
    ellipse(c, x + 8, y + 9, 3, 3, P.brown);
    D(c, x + 8, y + 9, P.slate);
    R(c, x + 7, y + 12, 3, 6, P.brown);
    R(c, x + 14, y + 16, 9, 1, P.brown);
    for (let i = 0; i < 3; i++) {
      R(c, x + 15 + i * 3, y + 6, 1, 10, P.clay);
      D(c, x + 15 + i * 3, y + 5, P.silver);
    }
  },
  // Round seven, phase 12. The Lampworks: lamps hung from the beam, a bench of glass chimneys, a crate of glass.
  lampworks(c, x, y) {
    R(c, x + 4, y + 2, 26, 1, P.brown);
    for (const dx of [7, 15, 23]) {
      R(c, x + dx, y + 3, 1, 3, P.steel);
      R(c, x + dx - 1, y + 6, 3, 3, '#86bff0');
      D(c, x + dx, y + 7, P.amber);
      R(c, x + dx - 1, y + 9, 3, 1, P.steel);
    }
    R(c, x + 30, y + 13, 14, 1, P.clay);
    R(c, x + 31, y + 14, 1, 4, P.brown);
    R(c, x + 42, y + 14, 1, 4, P.brown);
    for (const dx of [32, 36, 40]) {
      R(c, x + dx, y + 10, 2, 3, '#86bff0');
      D(c, x + dx, y + 10, P.white);
    }
    R(c, x + 6, y + 14, 9, 4, P.brown);
    R(c, x + 6, y + 14, 9, 1, P.clay);
    for (const dx of [8, 12]) D(c, x + dx, y + 13, '#86bff0');
  },
};

// Details only a room's twin has, for room types beyond the original eight (keyed by type).
const TWIN_ART = {
  // The Cold Forge: the blades on its rack are grave-steel, and glint.
  forge(c, x, y) {
    for (let i = 0; i < 4; i++) {
      R(c, x + 34 + i * 3, y + 6, 1, 9, UMBRA[6]);
      D(c, x + 34 + i * 3, y + 6, UMBRA[7]);
    }
  },
  // The Dreamwell: a still pool among the beds, and dreams rising off it.
  quarters(c, x, y) {
    ellipse(c, x + 24, y + 11, 5, 2, UMBRA[2]);
    ellipse(c, x + 24, y + 11, 3, 1, UMBRA[6]);
    for (let i = 0; i < 3; i++) D(c, x + 21 + i * 3, y + 7 - (i % 2) * 2, UMBRA[7]);
  },
  // The Hollow Cellar: the stores gone, like the Hollow Granary's.
  cellar(c, x, y) {
    R(c, x + 2, y + 10, 32, 8, UMBRA[2]);
    for (let i = 0; i < 3; i++) R(c, x + 2 + i * 7, y + 11, 6, 7, UMBRA[3]);
  },
  // The Archive of the Dead: the old books' spines glow, and a page hangs in the air over the desk.
  library(c, x, y) {
    for (let i = 0; i < 6; i++) D(c, x + 5 + i * 4, y + 5 + (i % 3) * 4, UMBRA[7]);
    R(c, x + 36, y + 7, 3, 2, UMBRA[6]);
  },
  // The Court of Shades: the high seat pale, as if someone sat in it.
  hall(c, x, y) {
    R(c, x + 39, y + 8, 4, 5, UMBRA[6]);
    D(c, x + 40, y + 7, UMBRA[7]);
    D(c, x + 41, y + 7, UMBRA[7]);
  },
  // The Lamp Gallery: the lamps on the beam still burning, pale, and their glass catching it on the bench.
  lampworks(c, x, y) {
    for (const dx of [7, 15, 23]) {
      R(c, x + dx - 1, y + 6, 3, 3, UMBRA[5]);
      D(c, x + dx, y + 7, UMBRA[7]);
    }
    for (const dx of [32, 36, 40]) D(c, x + dx, y + 10, UMBRA[6]);
  },
  // The Undergate: a way down into the Deep at the room's outer end, where the Unlit come up.
  gatehouse(c, x, y) {
    const px = x < MAP.W / 2 ? x + 1 : x + 39;
    R(c, px, y + 15, 8, 3, UMBRA[0]);
    R(c, px + 1, y + 16, 6, 2, '#000000');
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

// The keep's layers cover it from the roof (row roofY) down to the Veil, in world coordinates: each is
// drawn with a translate and placed at (0, roofY). The roof sits on whichever floor is highest.
function keepLayer(rnd) {
  const y0 = roofY();
  const cv = mk(W, VEIL - y0);
  const c = ctxOf(cv);
  c.translate(0, -y0);
  const S = { base: P.steel, dark: P.slate, light: P.silver };
  bricks(c, rnd, 0, y0 + 20, W, VEIL - y0 - 20, S);
  crenel(c, 0, y0 + 20, W, P.steel, P.slate);
  bricks(c, rnd, 44, y0 + 6, 24, 14, S);
  crenel(c, 44, y0 + 6, 24, P.steel, P.slate);
  R(c, 55, y0, 1, 6, P.brown);
  R(c, 56, y0, 5, 3, P.crimson);
  for (const x of [0, 104]) {
    bricks(c, rnd, x, y0 + 12, 8, 8, S);
    roof(c, x + 4, y0 + 12, 5, 8, P.crimson, P.plum);
  }
  for (const [x, y] of [[50, 11], [60, 11]]) R(c, x, y0 + y, 2, 3, P.amber);
  G.floors.forEach((fl, f) => {
    for (const [, a, b, type] of fl.rooms) {
      paintRoom(c, rnd, a, fl.y, b - a, ROOM_H, { wall: TONES[type][0], wall2: TONES[type][1], floor: P.brown, floorTop: P.clay });
      FURNISH[type](c, a, fl.y, f);
    }
  });
  for (const st of G.stairs) ladder(c, st);
  bricks(c, rnd, 0, VEIL - 4, W, 4, { base: P.slate, dark: P.indigo, light: P.steel });
  return cv;
}

// The Tain upright: the keep through the palette lookup, over the Deep, with each twin's own details.
function tainLayer(keep, rnd) {
  const y0 = roofY();
  const H = VEIL - y0;
  const cv = mk(W, H);
  const c = ctxOf(cv);
  const k = mk(W, H);
  const kc = ctxOf(k);
  kc.drawImage(keep, 0, 0);
  const img = kc.getImageData(0, 0, W, H);
  applyTain(img.data);
  kc.putImageData(img, 0, 0);
  c.drawImage(k, 0, 0);
  c.translate(0, -y0);
  // Each twin's own details, in every room of its type.
  for (const r of every('granary')) {
    // Hollow Granary: the stores are gone; only their outlines remain.
    const [x, y] = [r.x0, G.floors[r.f].y];
    R(c, x + 2, y + 8, 36, 10, UMBRA[2]);
    for (let i = 0; i < 3; i++) ring(c, x + 4 + i * 5, y + 15, 2, UMBRA[3]);
    for (let i = 0; i < 3; i++) ring(c, x + 19 + i * 5, y + 15, 2, UMBRA[3]);
    for (const dy of [0, 7]) R(c, x + 30, y + 10 + dy, 6, 1, UMBRA[3]);
  }
  for (const r of every('crypt')) R(c, r.x0 + 4, G.floors[r.f].y + 14, 14, 1, UMBRA[6]); // Waking Room: the slab glows
  for (const r of every('glazier')) {
    // Silvering: a pool of quicksilver under the bench.
    R(c, r.x0 + 15, G.floors[r.f].y + 17, 13, 1, UMBRA[7]);
    R(c, r.x0 + 17, G.floors[r.f].y + 16, 9, 1, UMBRA[6]);
  }
  for (const r of every('infirmary')) {
    // Threshold: a door of pale light in the far wall.
    R(c, r.x0 + 28, G.floors[r.f].y + 5, 4, 13, UMBRA[5]);
    R(c, r.x0 + 29, G.floors[r.f].y + 6, 2, 12, UMBRA[7]);
  }
  for (const [type, art] of Object.entries(TWIN_ART)) for (const r of every(type)) art(c, r.x0, G.floors[r.f].y);
  // The rifts on the deepest floor.
  for (const rf of MAP.rifts) {
    const fy = feet(G.deep);
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
  const y0 = roofY();
  const cv = mk(W, VEIL - y0);
  const c = ctxOf(cv);
  c.drawImage(L.keep, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  A(c, 0.62, () => R(c, 0, 0, W, VEIL - y0, '#0b0d26'));
  c.globalCompositeOperation = 'source-over';
  c.translate(0, -y0);
  for (const [x, y] of [[50, 11], [60, 11]]) R(c, x, y0 + y, 2, 3, P.yellow);
  for (const h of every('hearth')) clip(c, h.x0, G.floors[h.f].y, h.x1 - h.x0, ROOM_H, () => glow(c, h.x0 + 38, feet(h.f) - 4, 16, P.amber, 0.5));
  return cv;
}

// Built once per layout: a new room means new layers.
let cache = null;
function layers() {
  if (cache && cache.key === G.key) return cache;
  const rnd = rngOf(20260926);
  const keep = keepLayer(rnd);
  cache = { key: G.key, y0: roofY(), keep, tain: tainLayer(keep, rnd) };
  cache.nightKeep = nightKeepLayer(cache);
  return cache;
}

/* ---------------------------------------------------------------- the world around the keep */

// Skies as colour stops by world row (the keep's top is row 0, the lake is row VEIL), dithered at the seams.
const DAY_SKY = [[-9999, '#2f63c4'], [-150, '#3b7dd8'], [-60, '#5a9be6'], [10, '#86bff0'], [64, '#bfe1f6']];
// The year: the hills far and near in spring, summer, autumn and winter, and winter's paler sky.
const LAND = [['#8fb4a4', '#6fa878'], ['#a2c48a', '#7cb35e'], ['#b8a47c', '#b97c46'], ['#cfd9e4', '#eef3f8']];
const WINTER_SKY = [[-9999, '#8fa6c8'], [-60, '#b4c6dc'], [40, '#dbe5ef']];
const SUNSET_SKY = [[-9999, P.indigo], [-120, P.grape], [-30, P.mauve], [30, P.pink], [70, P.amber]];
const NIGHT_SKY = [[-9999, '#07060d'], [-120, P.void], [-30, P.night], [40, P.ink], [84, P.indigo]];
// The Tain's own sky, by upright row: the deeper, the darker.
// The eclipse (round six): noon gone dark, bluer than night, and lightest low down where the sky still glows.
const ECLIPSE_SKY = [[-9999, '#06050e'], [-150, '#0c0b1e'], [-60, '#171636'], [10, '#27244a'], [64, '#433a5e']];
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
// Rain: short slanting streaks on a repeating tile, falling fast.
const RAIN_TILE = 89;
function rain(c, x0, w, y0, y1, t, col) {
  const span = y1 - y0 + 40;
  for (let k = Math.floor(x0 / RAIN_TILE) - 1; k * RAIN_TILE < x0 + w + 10; k++) {
    for (let i = 0; i < 22; i++) {
      const x = k * RAIN_TILE + ((i * 41) % RAIN_TILE);
      const y = y0 - 20 + ((((t * (70 + (i % 4) * 12) + i * 67 + k * 31) % span) + span) % span);
      for (let j = 0; j < 3; j++) {
        const px = Math.round(x - (y + j) * 0.25);
        const py = Math.round(y + j);
        if (px >= x0 && px < x0 + w && py >= y0 && py < y1) D(c, px, py, col);
      }
    }
  }
}
// Fog: a pale haze, thickest near the water.
function fog(c, x0, w, y0, y1, col, a) {
  for (let y = y0; y < y1; y += 4) A(c, a * (0.35 + (0.65 * (y - y0)) / Math.max(1, y1 - y0)), () => R(c, x0, y, w, Math.min(4, y1 - y), col));
}
const RAIN_SKY = [[-9999, '#5d6878'], [-60, '#7a8594'], [40, '#9aa3ae']];
// Winter's snow: flakes on a repeating tile, each falling at its own pace and swaying a little.
const SNOW_TILE = 97;
function snow(c, x0, w, y0, y1, t) {
  const span = y1 - y0 + 40;
  for (let k = Math.floor(x0 / SNOW_TILE) - 1; k * SNOW_TILE < x0 + w; k++) {
    for (let i = 0; i < 14; i++) {
      const x = Math.round(k * SNOW_TILE + ((i * 37) % SNOW_TILE) + Math.sin(t * 0.8 + i) * 2);
      const y = Math.round(y0 - 20 + ((((t * (6 + (i % 3) * 2) + i * 53 + k * 29) % span) + span) % span));
      if (x >= x0 && x < x0 + w && y >= y0 && y < y1) D(c, x, y, P.white);
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
// A shade by day: its body pale against the daylight, with its eyes.
function daylightShade(c, d, x, y, t, a, pose) {
  const L = shadeLook(d);
  const pale = '#9aa3c8';
  const o = { ...L, silhouette: pale, far: '#7a82a6', helm: L.helm && pale, hood: L.hood && pale, pose, face: -1, ph: d.id.charCodeAt(1) || 0 };
  A(c, a, () => figure(c, Math.round(x), y, o, t));
}

function person(c, p, i, home, y, t, dim = 0) {
  const look = livingLook(p);
  const cyc = (t * 0.1 + i * 0.37 + (p.name.length % 7) * 0.13) % 1;
  const walkFrom = p.job ? 0.72 : 0.35;
  let face = i % 2 ? -1 : 1;
  let x = home;
  let pose = p.job && p.job !== 'barracks' && p.job !== 'gatehouse' ? 'work' : 'stand';
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
// Fire by day: a scorched room stands black; a burning one has flames across its floor, more and taller as
// it heats, smoke under its ceiling, and whoever was sent to fight it.
function fires(c, s, t) {
  for (const id of s.scorched || []) {
    const r = G.rooms[id];
    if (r) A(c, 0.55, () => R(c, r.x0, G.floors[r.f].y, r.x1 - r.x0, ROOM_H - 2, P.soot));
  }
  for (const f of s.fires || []) {
    const r = G.rooms[f.room];
    if (!r) continue;
    const y = feet(r.f);
    const n = 2 + Math.round(f.heat * 7);
    for (let i = 0; i < n; i++) {
      const x = Math.round(r.x0 + 4 + ((i + 0.5) * (r.x1 - r.x0 - 8)) / n);
      glow(c, x, y - 4, 5, P.orange, 0.2 + 0.25 * f.heat);
      flame(c, x, y - 1, t + i * 0.37, i + 7);
      if (f.heat > 0.6) flame(c, x + 1, y - 5, t + i * 0.61, i + 3);
    }
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.6 + i * 0.25) % 1;
      A(c, 0.4 * (1 - k), () => R(c, Math.round(r.x0 + 10 + (i * (r.x1 - r.x0 - 20)) / 3 + Math.sin(t + i) * 2), Math.round(G.floors[r.f].y + 7 - k * 6), 3, 2, P.steel));
    }
  }
}
function fireFighters(c, s, t) {
  for (const f of s.fires || []) {
    const r = G.rooms[f.room];
    const ps = s.living.filter((p) => p.fighting === f.room);
    if (r) ps.forEach((p, i) => person(c, { ...p, job: 'yard' }, i, r.x0 + 8 + ((i + 0.5) * (r.x1 - r.x0 - 16)) / ps.length, feet(r.f), t, 0));
  }
}
function dayActors(c, s, t, dusk = 0) {
  fires(c, s, t);
  for (const h of every('hearth')) {
    const hy = feet(h.f);
    glow(c, h.x0 + 38, hy - 3, 6, P.orange, 0.25);
    flame(c, h.x0 + 38, hy - 1, t, 0);
    flame(c, h.x0 + 36, hy - 1, t + 0.4, 1);
  }
  for (const g of every('glazier')) flame(c, g.x0 + 7, feet(g.f) - 2, t, 2);
  for (const g of every('forge')) {
    glow(c, g.x0 + 8, feet(g.f) - 4, 5, P.orange, 0.3);
    flame(c, g.x0 + 8, feet(g.f) - 3, t, 4);
  }
  // Masons work the wall walk on the roof, either side of the tower, among their cut stone.
  const masons = s.living.filter((p) => p.job === 'yard' && !p.fighting);
  const walk = roofY() + 20;
  if (masons.length) {
    for (const [dx, dy] of [[34, -2], [38, -2], [36, -4], [76, -2]]) {
      R(c, dx, walk + dy, 4, 2, P.steel);
      R(c, dx, walk + dy, 4, 1, P.silver);
    }
  }
  masons.forEach((p, i) => person(c, { ...p, job: 'yard' }, i, [18, 90, 28, 100, 12, 82][i % 6], walk, t, Math.min(1, dusk * 1.6)));
  // While the Host is at the gate, the guards and whoever the bell brought stand the walk on the east side.
  const fight = s.raid?.state === 'assault';
  const onWalk = fight ? s.living.filter((p) => (p.job === 'barracks' || p.job === 'gatehouse' || p.walls) && p.job !== 'yard') : [];
  onWalk.forEach((p, i) => person(c, { ...p, job: p.job === 'gatehouse' ? 'gatehouse' : 'barracks' }, i, [98, 91, 84, 102, 77, 70, 63, 56, 49][i % 9], walk, t));
  // Workers of a type fill its rooms in turn, as many as a room holds; the idle wait by the first hearth. A
  // shade stepped through a great glass works among them.
  const byType = {};
  for (const p of s.living) if (p.job !== 'yard' && !onWalk.includes(p)) (byType[p.job || 'hearth'] ||= []).push(p);
  const dead = s.tuning.whispers && !dusk ? s.shades.filter((d) => d.byDay && d.mirror) : [];
  for (const d of dead) {
    if (d.byDay.how === 'step' && s.mirrors.find((m) => m.id === d.mirror)?.type === 'great' && d.byDay.room !== 'yard') (byType[d.byDay.room] ||= []).push({ shade: d });
  }
  const cap = s.tuning.roomCap || 99;
  const byRoom = new Map();
  for (const [type, ps] of Object.entries(byType)) {
    const rooms = every(type).length ? every(type) : every('hearth');
    ps.forEach((p, i) => {
      const r = rooms[Math.min(rooms.length - 1, Math.floor(i / cap))];
      if (!byRoom.has(r)) byRoom.set(r, []);
      byRoom.get(r).push(p);
    });
  }
  for (const [r, ps] of byRoom) {
    const n = ps.length;
    ps.forEach((p, i) => {
      const home = r.x0 + 6 + ((i + 0.5) * (r.x1 - r.x0 - 14)) / n;
      if (p.shade) daylightShade(c, p.shade, home, feet(r.f), t, 0.6, 'work');
      else person(c, p, i, home, feet(r.f), t, Math.min(1, dusk * 1.6));
    });
  }
  // One whispering its old trade stands faint at the back of the first room of it, leaning to the workers.
  for (const d of dead) {
    if (d.byDay.how !== 'whisper') continue;
    const trade = d.job || s.ledger.find((e) => e.id === d.id)?.job;
    const r = trade && every(trade)[0];
    if (r) daylightShade(c, d, r.x1 - 5, feet(r.f), t, 0.3 + 0.1 * Math.sin(t * 1.3), 'stand');
  }
  fireFighters(c, s, t);
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
    // The inspector walks the Chapel, or the Hearth in a keep that hasn't built one.
    const ch = span(every('chapel')[0]?.id || 'hearth');
    const x = Math.round(ch.x0 + 10 + (s.inspection.done ? 0 : Math.sin(t * 0.4) * 4));
    const walking = !s.inspection.done && Math.abs(Math.cos(t * 0.4)) > 0.3;
    figure(c, x, feet(ch.f), {
      tunic: P.ink, legs: P.ink, belt: P.amber, shoes: P.night, skin: P.peach, hair: P.night, robe: 1, hood: P.ink, prop: 'lantern',
      pose: walking ? 'walk' : 'stand', face: Math.cos(t * 0.4) >= 0 ? 1 : -1, ph: 9,
    }, t);
  }
  // A raid on the way: war banners on the turrets, and the Host's torches coming over the eastern hills. A
  // crusade comes in the Lantern Church's white and gold, carrying lanterns.
  const r = s.raid;
  const look = r?.crusade ? CRUSADE : HOST;
  if (r && r.warned && r.state === 'coming') {
    const k = Math.max(0, Math.min(1, (s.t - r.warnAt) / Math.max(1, r.hitAt - r.warnAt)));
    // War banners over the turrets: the one warning you can see from anywhere.
    for (const x of [4, 108]) {
      const wave = MF(t * 4 + x) % 2;
      R(c, x, roofY() - 8, 1, 11, P.brown);
      R(c, x + 1, roofY() - 8, 5, 2, look.flag);
      R(c, x + 1, roofY() - 6, 4 + wave, 2, look.flag);
      D(c, x + 5 + wave, roofY() - 6, look.edge);
    }
    for (let i = 0; i < Math.min(10, r.count); i++) {
      const x = Math.round(W + 4 + (1 - k) * 36 + i * 6);
      const y = ridgeTop(x, RIDGES.near) - 1;
      human(c, x - 1, y + 1, { body: look.body, helm: look.helm, h: 6, walk: 3, ph: i }, t);
      D(c, x + 3, y - 6, (MF(t * 6) + i) % 2 ? look.fire[0] : look.fire[1]);
    }
  }
  if (r && r.state === 'assault') assaultArt(c, s, r, t);
  const g = s.siege;
  if (g && !g.broken && s.day >= g.from && s.day <= g.until && dusk < 1) campArt(c, t);
  if (r && r.state === 'breached' && dusk < 1) {
    for (let i = 0; i < 5; i++) {
      const x = 10 + i * 22 + Math.sin(t + i) * 2;
      const y = roofY() + 16 - ((t * 3 + i * 5) % 18);
      A(c, 0.5 * (1 - dusk), () => ellipse(c, x, y, 2, 1, P.slate));
    }
  }
}

// Autumn's siege: the Host's tents on the eastern hills, a banner and a fire, while the camp stands.
function campArt(c, t) {
  for (const [i, x0] of [W + 1, W + 9, W + 17].entries()) {
    const y = ridgeTop(x0 + 3, RIDGES.near) - 1;
    for (let k = 0; k < 5; k++) R(c, x0 + 3 - k, y - 5 + k, 1 + 2 * k, 1, k === 0 ? P.brown : i % 2 ? P.crimson : P.red);
    D(c, x0 + 3, y - 1, P.night);
  }
  const fx = W + 7;
  const fy = ridgeTop(fx, RIDGES.near) - 1;
  flame(c, fx, fy, t, 3);
  R(c, W + 15, fy - 12, 1, 12, P.brown);
  R(c, W + 16, fy - 12, 4, 2, P.red);
}

// The Host's colours, and a crusade's: banner, its edge, tabard, helm, and the flames they carry.
const HOST = { flag: P.red, edge: P.orange, body: P.crimson, helm: P.slate, fire: [P.orange, P.yellow] };
const CRUSADE = { flag: P.white, edge: P.amber, body: P.bone, helm: P.amber, fire: [P.yellow, P.white] };
// The Host at the gate: raiders massed on the east shore under their banners, a ram swung at the wall, cracks
// as the gate gives, and burning pitch poured on them from the battlements.
const CRACKS = [[0, 3], [1, 4], [0, 5], [1, 6], [2, 6], [0, 8], [1, 9], [2, 10], [1, 11], [0, 12]];
function assaultArt(c, s, r, t) {
  const gx = MAP.RIGHT - 1;
  const base = MAP.VEIL - 2;
  const look = r.crusade ? CRUSADE : HOST;
  for (const x of [4, 108]) {
    const wave = MF(t * 4 + x) % 2;
    R(c, x, roofY() - 8, 1, 11, P.brown);
    R(c, x + 1, roofY() - 8, 5, 2, look.flag);
    R(c, x + 1, roofY() - 6, 4 + wave, 2, look.flag);
  }
  // A mob pressed against the east wall, close enough to show even on a phone.
  const n = Math.min(9, r.count);
  const ground = (x) => Math.min(base, ridgeTop(x, RIDGES.near) - 1);
  for (let i = 0; i < n; i++) {
    const x = Math.round(MAP.RIGHT + 4 + i * 3 + Math.sin(t * 3 + i) * 1);
    const y = ground(x);
    human(c, x - 1, y + 1, { body: look.body, helm: look.helm, h: 6, walk: 2, ph: i }, t);
    if (i % 2) D(c, x + 3, y - 6, (MF(t * 6) + i) % 2 ? look.fire[0] : look.fire[1]);
  }
  // The ram: back, then into the wall.
  const swing = (t * 1.2) % 1 < 0.75 ? 3 : 0;
  const ry = ground(gx + 6) - 4;
  R(c, gx + 1 + swing, ry, 8, 2, P.brown);
  D(c, gx + 1 + swing, ry, P.slate);
  // Ladders set against the wall (from summer), those still standing.
  for (let i = 0; i < Math.min(4, r.ladders?.up || 0); i++) {
    const lx = gx + 2 + i * 4;
    const top = roofY() + 20;
    const y0 = ground(lx);
    R(c, lx, top, 1, y0 - top, P.brown);
    R(c, lx + 2, top, 1, y0 - top, P.brown);
    for (let y = top + 1; y < y0; y += 3) R(c, lx, y, 3, 1, P.clay);
  }
  // The gate gives: cracks up the wall as it weakens.
  const shown = Math.round((1 - Math.max(0, r.gate)) * CRACKS.length);
  for (const [dx, dy] of CRACKS.slice(0, shown)) D(c, gx - dx, base - dy, P.ink);
  // Pitch, for a second after it's poured.
  const since = s.t - (r.pitchAt ?? -99);
  if (since >= 0 && since < 12) {
    const top = roofY() + 20;
    for (let k = 0; k < 4; k++) {
      const y = top + ((since * 3 + k * 5) % (base - top));
      R(c, gx + 1 + k, y, 1, 3, P.ink);
      D(c, gx + 1 + k, y + 3, MF(t * 10 + k) % 2 ? P.orange : P.yellow);
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
// The Unlit's eyes. Red alone goes dark to anyone who can't see red (protanopia, deuteranopia), and a Creeper
// is nothing but its eyes in the dark, so each eye has a pale glint above it that stays bright whatever the
// colour vision. It also makes a Creeper's eyes two small upright marks near the floor, unlike a shade's
// level pair at head height.
export const UNLIT_EYES = { red: P.hot, gnaw: P.orange, glint: '#ffc2d1' };
export function creeperEyes(c, u, x, y, t) {
  const bx = Math.round(x - 3);
  const bob = u.climb ? 0 : Math.round(Math.sin(t * 4 + u.x));
  const col = u.gnawing ? UNLIT_EYES.gnaw : UNLIT_EYES.red;
  for (const ex of [bx + 2, bx + 4]) {
    D(c, ex, Math.round(y) - 3 + bob, UNLIT_EYES.glint);
    D(c, ex, Math.round(y) - 2 + bob, col);
  }
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
// A Weeper: tall, thin and stooped, pale where the other Unlit are dark, its hands to its face. It's drawn
// over the lighting, so it shows in the dark it haunts; while it weeps there, tears fall from it.
const WEEPER = { head: '#9aabc8', body: '#6f7fa0', hands: '#c2d0e8', tear: '#9fd6ff' };
function weeperSprite(c, u, x, y, t) {
  const bx = Math.round(x - 2);
  const by = Math.round(y);
  const sway = u.mode === 'weep' ? Math.round(Math.sin(t * 1.5 + u.x)) : 0;
  R(c, bx + 1 + sway, by - 10, 3, 2, WEEPER.head);
  R(c, bx, by - 8, 4, 6, WEEPER.body);
  R(c, bx - 1, by - 2, 6, 2, WEEPER.body);
  D(c, bx + 3 + sway, by - 8, WEEPER.hands);
  if (u.mode === 'weep' && !u.quiet) {
    const k = t ? MF(t * 4 + u.x) % 4 : 1;
    D(c, bx + 2 + sway, by - 7 + k, WEEPER.tear);
  }
}
// One of the Drowned: stooped and sodden, long arms hanging, weed on it. Dark like the other Unlit, so in the
// dark only its eyes show: pale, level and wide-set, high on it (a Creeper's are an upright pair at the
// floor), with water running off it.
const DROWNED = { body: '#08141a', weed: '#123a33', eye: '#8ff0dc', drip: '#7fbfff' };
const drownSway = (u, t) => (u.grab ? 0 : Math.round(Math.sin(t * 2 + u.x) * 0.8));
function drownedSprite(c, u, x, y, t) {
  const bx = Math.round(x - 2);
  const by = Math.round(y);
  const sw = drownSway(u, t);
  R(c, bx + sw, by - 9, 4, 3, DROWNED.body);
  R(c, bx - 1, by - 6, 6, 4, DROWNED.body);
  R(c, bx, by - 2, 4, 2, DROWNED.body);
  R(c, bx - 2, by - 5, 1, 3, DROWNED.body);
  R(c, bx + 5, by - 5, 1, 3, DROWNED.body);
  D(c, bx + 1, by - 5, DROWNED.weed);
  D(c, bx + 3 + sw, by - 7, DROWNED.weed);
}
function drownedEyes(c, u, x, y, t) {
  const bx = Math.round(x - 2) + drownSway(u, t);
  const by = Math.round(y);
  D(c, bx, by - 8, DROWNED.eye);
  D(c, bx + 3, by - 8, DROWNED.eye);
  if (t) {
    const k = MF(t * 5 + u.x) % 6;
    if (k < 4) D(c, bx + 1 + (MF(u.x) % 3), by - 5 + k, DROWNED.drip);
  }
}
// The moat's twin at the ends of the floor under the Veil, on a rainy night: dark water, stirring where the
// Drowned are still to come up.
function moatWater(c, s, t) {
  const y = feet(G.veil);
  const rising = new Set((s.night?.spawns || []).filter((x) => x.type === 'drowned').map((x) => x.rift));
  for (const w of MAP.moat) {
    const x0 = Math.max(MAP.LEFT, w.x - 3);
    R(c, x0, y - 1, 7, 1, '#1d3b5a');
    const k = t ? MF(t * 3 + w.x) % 5 : 2;
    D(c, x0 + k + 1, y - 1, '#6fa6d8');
    if (rising.has(w.id)) glow(c, w.x, y - 2, 4, '#7fe3ff', 0.18 + (t ? 0.1 * Math.sin(t * 3) : 0.1));
  }
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
    D(c, cx + Math.round(Math.cos(a) * 3), cy + Math.round(Math.sin(a) * 2), MF(t * 2 + i) % 3 ? UNLIT_EYES.red : UNLIT_EYES.glint);
  }
}
function candleStick(c, k) {
  const h = 1 + Math.ceil((3 * Math.max(0, k.wax)) / k.max);
  R(c, Math.round(k.x), feet(k.f) - h + 1, 1, h, UMBRA[6]);
  return feet(k.f) - h;
}
// A room a Maw broke tonight: three cracks down its back wall.
function cracked(c, r, y) {
  for (let i = 0; i < 3; i++) {
    let x = r.x0 + 7 + ((r.x0 * 5 + i * 13) % (r.x1 - r.x0 - 14));
    for (let yy = y + 1; yy < y + ROOM_H - 2; yy++) {
      D(c, x, yy, i === 1 ? P.hot : P.crimson);
      if ((yy * 3 + i + r.x0) % 4 === 0) x += ((yy + i) % 3) - 1;
    }
  }
}
// Corner brackets round a room: what a Maw is making for.
function brackets(c, r, y, col) {
  const y1 = y + ROOM_H - 1;
  for (const [x, dx] of [[r.x0, 1], [r.x1 - 1, -1]]) {
    for (const yy of [y, y1]) R(c, dx > 0 ? x : x - 3, yy, 4, 1, col);
    R(c, x, y, 1, 4, col);
    R(c, x, y1 - 3, 1, 4, col);
  }
}
// A room haunted by day: cold light, and one of the dead drifting through it.
function haunt(c, r, y, t) {
  A(c, 0.18, () => R(c, r.x0, y, r.x1 - r.x0, ROOM_H, '#9fc7ff'));
  const k = Math.sin(t * 0.6 + r.x0);
  const x = Math.round(r.x0 + 8 + ((k + 1) * (r.x1 - r.x0 - 16)) / 2);
  const o = { silhouette: '#dbe8ff', wisp: true, pose: 'stand', face: Math.cos(t * 0.6 + r.x0) > 0 ? 1 : -1 };
  A(c, 0.45 + 0.15 * Math.sin(t * 3), () => figure(c, x, y + ROOM_H - 2, o, t));
}
function sigil(c, x, y, hold) {
  const col = hold != null && hold < 6 ? P.hot : '#f0b0ff';
  ring(c, x, y, 3, col);
  D(c, x, y, col);
  D(c, x, y - 2, col);
  D(c, x, y + 2, col);
}


// The black mirror at dusk (threats.js): each rift's way up as dots marching the way the Unlit will go,
// a bite where they'll gnaw, a ring round a mirror they can reach, a mark over a shade they'll catch; the
// candle hunters' way, sparser and a row higher, where it differs; brackets on what the Maw would make for;
// the Hollow's way in bigger dots on the new moon. Shapes differ as well as colours. Still with less motion.
const WAY = { climb: P.red, open: P.hot, hunt: P.pink, hollow: '#d4b8ff', drowned: '#8ff0dc' };
// A way as a faint dotted line with chevrons along it pointing where it goes; the chevrons march unless
// motion is off. lift: how far above the floor it runs.
function trace(c, pts, col, { gap = 8, lift = 4, big = false, t = 0 } = {}) {
  const march = MF(t * 6) % gap;
  let n = 0;
  const step = (x, y, dx, dy) => {
    const k = (n - march + gap * 64) % gap;
    if (k === 0) {
      // A chevron, its point toward the way ahead.
      D(c, x, y, col);
      for (const side of [-1, 1]) {
        D(c, x - dx + (dy ? side : 0), y - dy + (dx ? side : 0), col);
        if (big) D(c, x - 2 * dx + (dy ? 2 * side : 0), y - 2 * dy + (dx ? 2 * side : 0), col);
      }
    } else if (n % 2 === 0) A(c, 0.55, () => D(c, x, y, col));
    n++;
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.f === b.f) {
      const y = feet(a.f) - lift;
      const x0 = Math.round(a.x);
      const x1 = Math.round(b.x);
      const dx = Math.sign(x1 - x0);
      for (let x = x0; x !== x1; x += dx) step(x, y, dx, 0);
    } else {
      // Up or down the stair at b.x.
      const y0 = feet(a.f) - lift;
      const y1 = feet(b.f) - lift;
      const dy = Math.sign(y1 - y0);
      for (let y = y0; y !== y1; y += dy) step(Math.round(b.x), y, 0, dy);
    }
  }
}
function bite(c, x, y, col) {
  for (const k of [-2, -1, 0, 1, 2]) {
    D(c, x + k, y + k, col);
    D(c, x + k, y - k, col);
  }
}
const mirrorAt = (id) => {
  const m = MAP.mirrors.find((x) => x.id === id);
  return m && { x: m.x, y: G.floors[G.veil].y + 7 };
};
function wayEnd(c, s, w, col, t, lift = 4) {
  const last = w.pts[w.pts.length - 1];
  if (w.end === 'gnaw') bite(c, Math.round(last.x), feet(last.f) - lift, col);
  else if (w.end === 'veil') {
    const m = mirrorAt(w.mirror);
    if (m && (!t || MF(t * 3) % 2)) {
      ring(c, m.x, m.y, 6, col);
      ring(c, m.x, m.y, 7, col, (dx, dy) => (dx + dy) % 2 === 0);
    }
  } else if (w.end === 'catch') {
    const d = s.shades.find((x) => x.id === w.prey);
    if (!d) return;
    const x = Math.round(d.x);
    const y = feet(d.f) - FIG_H[shadeLook(d).age] - 3;
    R(c, x - 1, y - 7, 3, 1, UMBRA[0]);
    R(c, x - 1, y - 6, 3, 5, UMBRA[0]);
    R(c, x, y - 6, 1, 4, col);
    D(c, x, y - 1, col);
  }
}
const sameWay = (a, b) => a && b && a.end === b.end && JSON.stringify(a.pts) === JSON.stringify(b.pts);
function threatLayer(c, s, th, t) {
  for (const m of th.maws) {
    const tg = m.target;
    if (!tg) continue;
    A(c, 0.75, () => {
      if (tg.kind === 'room' && G.rooms[tg.id]) brackets(c, G.rooms[tg.id], G.floors[tg.f].y, P.orange);
      else ring(c, Math.round(tg.x), feet(tg.f) - 3, 4, P.orange, (dx, dy) => (dx + dy) % 2 === 0);
    });
  }
  if (th.hollow) {
    trace(c, th.hollow.pts, WAY.hollow, { gap: 10, lift: 9, big: true, t });
    const last = th.hollow.pts[th.hollow.pts.length - 1];
    const m = last && mirrorAt(MAP.mirrors.reduce((a, b) => (Math.abs(b.x - last.x) < Math.abs(a.x - last.x) ? b : a)).id);
    if (m) ring(c, m.x, m.y, 8, WAY.hollow);
  }
  if (th.drowned?.way) {
    trace(c, th.drowned.way.pts, WAY.drowned, { gap: 6, lift: 10, t });
    wayEnd(c, s, th.drowned.way, WAY.drowned, t, 10);
  }
  for (const e of th.rises) {
    if (e.hunt && !sameWay(e.hunt, e.way)) {
      trace(c, e.hunt.pts, WAY.hunt, { gap: 12, lift: 7, t });
      wayEnd(c, s, e.hunt, WAY.hunt, t, 7);
    }
    if (e.way) {
      const col = e.way.end === 'veil' ? WAY.open : WAY.climb;
      trace(c, e.way.pts, col, { gap: e.way.end === 'veil' ? 5 : 8, t });
      wayEnd(c, s, e.way, col, t);
    }
  }
}

// Light as the renderer sees it: exactly the simulation's lit spans on each floor, with a short dithered
// falloff outside them, and the Hollow swallowing what's around it.
function lightFor(s, hollow, ambient) {
  const L = lightMap(G, s.tuning, s.night?.candles || []);
  return (x, y) => {
    let f = -1;
    for (let i = 0; i < G.n; i++) if (y >= G.floors[i].y && y < G.floors[i].y + ROOM_H) f = i;
    if (f < 0) return ambient * 0.8;
    let d = Infinity;
    for (const [a, b] of L.merged[f]) d = Math.min(d, x < a ? a - x : x > b ? x - b : 0);
    let v = Math.max(ambient, 1 - d / 5);
    if (hollow && f === hollow.f) v *= Math.min(1, Math.abs(x - hollow.x) / 10 + 0.3);
    return v;
  };
}

// The Tain upright, lit, with everything in it. opts: alpha (between ticks), selected (shade id),
// ghost ({ f, x, tool }) for the candle or ward preview, marks (guide rings), threats (the black mirror at
// dusk), cursor ({ f, x }, the keyboard's). t is 0 with less motion: nothing marches or blinks, and what
// blinks stays on.
// A shade's act as the Tain shows it: what it's doing now, if anything.
const actNow = (s, d) => (d.act && (s.phase === 'night' || !!s.eclipse) && s.t < d.act.until ? d.act.what : null);
function composeTain(s, t, opts = {}) {
  const L = layers();
  const y0 = L.y0;
  const work = buf('tain', W, VEIL - y0);
  const c = ctxOf(work);
  const n = s.night;
  const alpha = opts.alpha ?? 1;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, VEIL - y0);
  c.drawImage(L.tain, 0, 0);
  c.setTransform(1, 0, 0, 1, 0, -y0);
  for (const ch of every('chapel')) ring(c, ch.x0 + 29, G.floors[ch.f].y + 8, 4 + (MF(t * 3) % 3), UMBRA[5], (dx, dy) => dy < 0);
  const candles = n?.candles || [];
  // A candle stands on its stick; a lantern hangs from the hand of the shade carrying it.
  const flames = candles.map((k) => {
    // A wisp (round seven, phase 9) is essence burning: no stick, a pale light that sinks as it burns out.
    if (k.wisp) return { k, x: Math.round(k.x), y: feet(k.f) - 2 - Math.ceil((3 * Math.max(0, k.wax)) / k.max), wisp: true };
    if (!k.carrier) return { k, x: Math.round(k.x), y: candleStick(c, k) };
    const x = Math.round(k.x) + 2;
    const y = feet(k.f) - 6;
    R(c, x - 1, y - 2, 3, 1, UMBRA[4]);
    R(c, x - 1, y + 2, 3, 1, UMBRA[4]);
    return { k, x, y: y + 1, lantern: true };
  });
  if (opts.ghost?.tool === 'candle') R(c, Math.round(opts.ghost.x), feet(opts.ghost.f) - 3, 1, 3, UMBRA[7]);
  const shades = s.shades.filter((d) => d.mirror && d.kind !== 'wraith' && d.kind !== 'restless' && !d.deep);
  const shadePos = shades.map((d) => ({ d, ...unitAt(d, alpha) }));
  const sprite = (d, x, y) => (actNow(s, d) === 'pass' ? A(c, 0.35, () => shadeSprite(c, d, x, y, t)) : shadeSprite(c, d, x, y, t));
  for (const { d, x, y } of shadePos) sprite(d, x, y);
  const foes = (n?.foes || []).map((u) => ({ u, ...unitAt(u, alpha) }));
  for (const { u, x, y } of foes) {
    if (u.type === 'creeper') creeperSprite(c, u, x, y, t);
    else if (u.type === 'wraith') wraithSprite(c, x, y, t);
    else if (u.type === 'maw') mawSprite(c, u, x, y, t);
    else if (u.type === 'drowned') drownedSprite(c, u, x, y, t);
    else if (u.type !== 'weeper') hollowSprite(c, x, y, t);
  }
  const hollow = foes.find((f) => f.u.type === 'hollow');
  const img = c.getImageData(0, 0, W, VEIL - y0);
  applyLight(img.data, W, VEIL - y0, lightFor(s, hollow && !hollow.u.climb ? { f: hollow.u.f, x: hollow.x } : null, opts.ambient ?? 0.2), y0);
  c.putImageData(img, 0, 0);

  // Rooms broken tonight, and what each Maw is making for (blinking): brackets on a room, a ring on a candle.
  for (const id of n?.broken || []) if (G.rooms[id]) cracked(c, G.rooms[id], G.floors[G.rooms[id].f].y);
  // A Maw standing unmet in a room it broke (round seven, phase 7): a bar along the room's top fills toward
  // its ruin, and stops while a shade meets it.
  for (const m of n?.foes || []) {
    const r = m.type === 'maw' && m.ruining && G.rooms[m.ruining];
    if (!r) continue;
    const w = r.x1 - r.x0 - 4;
    const k = Math.min(1, (m.ruin || 0) / Math.round((s.tuning?.mawRuin || 12) * TICKS_PER_SEC));
    R(c, r.x0 + 2, G.floors[r.f].y + 2, w, 2, UMBRA[0]);
    R(c, r.x0 + 2, G.floors[r.f].y + 2, Math.max(1, Math.round(w * k)), 2, P.hot);
  }
  for (const m of n?.foes || []) {
    const tg = m.type === 'maw' && m.target;
    if (!tg || (t && !(MF(t * 3) % 2))) continue;
    if (tg.kind === 'room' && G.rooms[tg.id]) brackets(c, G.rooms[tg.id], G.floors[tg.f].y, P.hot);
    else ring(c, Math.round(tg.x), feet(tg.f) - 3, 4, P.hot);
  }
  if (opts.threats) threatLayer(c, s, opts.threats, t);
  // What gives off its own light goes on after the lighting.
  for (const h of every('hearth')) {
    flame(c, h.x0 + 38, feet(h.f) - 1, t, 3, [P.cyan, '#9fe6ff', P.blue]);
    flame(c, h.x0 + 36, feet(h.f) - 1, t + 0.3, 5, [P.cyan, '#9fe6ff', P.blue]);
  }
  for (const g of every('forge')) flame(c, g.x0 + 8, feet(g.f) - 3, t, 6, [P.cyan, '#9fe6ff', P.blue]);
  for (const wk of every('chandlery')) for (let i = 0; i < 3; i++) flame(c, wk.x0 + 3 + i * 4, G.floors[wk.f].y + 9 + Math.round(Math.sin(t * 2 + i)), t, i, [P.cyan, '#9fe6ff', P.blue]);
  // Omens (round six): a sealed rift is slabbed over and dark; under a blood moon the rifts burn brighter.
  const omen = n?.omen || null;
  for (const rf of MAP.rifts) {
    const y = feet(G.deep);
    if (omen?.id === 'sealed' && omen.rift !== rf.id) {
      R(c, rf.x - 4, y - 3, 9, 3, '#4a4458');
      R(c, rf.x - 4, y - 3, 9, 1, '#6c6680');
      D(c, rf.x, y - 2, '#9a93b0');
      continue;
    }
    const pulse = 0.25 + 0.2 * Math.sin(t * 2 + rf.x);
    glow(c, rf.x, y - 2, omen?.id === 'blood' ? 7 : 5, P.hot, omen?.id === 'blood' ? pulse + 0.15 : pulse);
  }
  if (skyOf(s) === 'rain' && n) moatWater(c, s, t);
  // The Undergate, open from summer: a glow at its mouth, unless it's warded tonight.
  const ug = s.tuning.gatehouse && s.season >= s.tuning.undergateFrom && roomsOf(G, 'gatehouse')[0];
  if (ug && n && !n.wards.includes('undergate')) glow(c, ug.x0 < MAP.W / 2 ? ug.x0 + 4 : ug.x1 - 4, feet(ug.f) - 2, 5, P.hot, 0.2 + 0.15 * Math.sin(t * 2 + 1));
  // A shade gone down into the Deep: a thread of silver glinting at the mouth of a rift until dawn.
  s.shades.filter((d) => d.deep).forEach((d, i) => {
    const rf = MAP.rifts[i % MAP.rifts.length];
    const y = feet(G.deep);
    const k = t ? MF(t * 2 + i) % 4 : 0;
    glow(c, rf.x + (i % 2 ? 2 : -2), y - 1, 3, '#dfefff', 0.3);
    D(c, rf.x + (i % 2 ? 2 : -2), y - 1 - k, '#eef6ff');
  });
  // The mirrors under the Veil, where the Unlit are headed: always bright enough to find.
  for (const m of MAP.mirrors) {
    const my = G.floors[G.veil].y + 4;
    glow(c, m.x, my + 3, 5, '#f0b0ff', 0.2 + 0.08 * Math.sin(t * 1.5 + m.x));
    R(c, m.x - 2, my, 5, 7, P.mauve);
    R(c, m.x - 1, my + 1, 3, 5, UMBRA[7]);
    D(c, m.x - 1, my + 1, P.white);
  }
  flames.forEach(({ x, y, lantern, wisp }, i) => {
    if (wisp) {
      glow(c, x, y, 3, P.cyan, 0.3);
      D(c, x, y, !t || (MF(t * 6) + i) % 3 ? P.white : P.cyan);
      D(c, x, y - 1, P.cyan);
      return;
    }
    glow(c, x, y - 1, 3, P.amber, 0.25);
    if (lantern) D(c, x, y, !t || (MF(t * 8) + i) % 2 ? P.yellow : P.amber);
    else flame(c, x, y, t, i);
  });
  // Tonight's errands: an echo shimmers pale blue, a relic glints silver, and a sleepwalker walks pale, with
  // their eyes shut.
  for (const e of n?.errands || []) {
    if (e.done) continue;
    const x = Math.round(e.x);
    const y = feet(e.f);
    if (e.kind === 'echo') {
      glow(c, x, y - 4, 4, P.cyan, 0.35);
      D(c, x, y - 4, !t || MF(t * 3 + x) % 2 ? P.white : P.cyan);
      D(c, x - 1, y - 5, P.cyan);
      D(c, x + 1, y - 3, P.cyan);
    } else if (e.kind === 'relic') {
      R(c, x - 1, y - 2, 3, 2, P.steel);
      D(c, x, y - 3, P.silver);
      if (!t || MF(t * 2 + x) % 3 === 0) D(c, x + 1, y - 4, P.white);
    } else if (e.out && !e.climb) {
      const p = s.living.find((q) => q.id === e.who);
      if (p) A(c, 0.55, () => figure(c, x, y, { ...livingLook(p), pose: 'walk', face: (e.path?.[0]?.x ?? x) >= x ? 1 : -1, ph: 3 }, t));
      // Held by the Unlit: the same flashing bar as a caught shade.
      if (p && e.held && (!t || MF(t * 4) % 2)) R(c, x - 3, y - 7, 6, 1, P.hot);
    }
  }
  for (const w of n?.wards || []) {
    const st = G.stairs.find((x) => x.id === w);
    if (st) {
      sigil(c, st.x, feet(st.f) - 6, n.wardHold?.[w]);
      sigil(c, st.x, feet(st.f + 1) - 6, n.wardHold?.[w]);
    } else if (w === 'moat') {
      for (const m of MAP.moat) sigil(c, m.x, feet(G.veil) - 6);
    } else {
      const rf = MAP.rifts.find((x) => x.id === w);
      if (rf) sigil(c, rf.x, feet(G.deep) - 6);
    }
  }
  if (opts.ghost?.tool === 'ward' && opts.ghost.target) {
    const g = opts.ghost.target;
    A(c, 0.6, () => sigil(c, g.x, feet(g.f) - 6));
  }
  // Every shade carries a faint glow of its own, so a silhouette in the dark can still be found.
  for (const { d, x, y } of shadePos) {
    glow(c, Math.round(x), Math.round(y) - 6, 6, '#7d6bd6', 0.3);
    sprite(d, x, y);
  }
  for (const { d, x, y } of shadePos) {
    shadeEyes(c, d, x, y, t);
    const hh = FIG_H[shadeLook(d).age];
    const bx = Math.round(x);
    const by = Math.round(y);
    if (d.grabbedBy && (!t || MF(t * 4) % 2)) R(c, bx - 3, by - 7, 6, 1, P.hot);
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
    else if (u.type === 'drowned') drownedEyes(c, u, x, y, t);
    else if (u.type === 'weeper') A(c, 0.85, () => weeperSprite(c, u, x, y, t));
    else hollowEyes(c, x, y, t);
  }
  // Tonight's acts: a Loyal shade standing its ground glows gold under a bar of light; a Stranger's lure
  // rings out red; a kindling flares. One passing unseen is drawn faint, above.
  for (const { d, x, y } of shadePos) {
    const a = actNow(s, d);
    if (!a || a === 'pass') continue;
    const bx = Math.round(x);
    const by = Math.round(y);
    if (a === 'stand') {
      glow(c, bx, by - 6, 9, P.amber, t ? 0.3 + 0.15 * Math.sin(t * 6) : 0.4);
      R(c, bx - 3, by - FIG_H[shadeLook(d).age] - 4, 7, 1, P.amber);
    } else if (a === 'lure') ring(c, bx, by - 6, 5 + (MF(t * 6) % 6), P.hot, (dx, dy) => (dx + dy) % 2 === 0);
    else glow(c, bx, by - 8, 10, P.yellow, 0.6);
  }
  // Guide marks: pulsing rings on the spots a guide card is talking about.
  for (const m of opts.marks || []) {
    const r = 5 + (MF(t * 4) % 3);
    ring(c, Math.round(m.x), feet(m.f) - 5, r, P.yellow);
    ring(c, Math.round(m.x), feet(m.f) - 5, r + 1, P.amber, (dx, dy) => (dx + dy) % 2 === 0);
  }
  // The keyboard's cursor: corner brackets round a figure's height at the spot, pulsing yellow and amber.
  if (opts.cursor) {
    const col = !t || MF(t * 2) % 2 ? P.yellow : P.amber;
    const x = Math.round(opts.cursor.x);
    const foot = feet(opts.cursor.f) + 1;
    for (const [cx, sx] of [[x - 4, 1], [x + 4, -1]]) {
      for (const [cy, sy] of [[foot - 14, 1], [foot, -1]]) {
        R(c, sx > 0 ? cx : cx - 2, cy, 3, 1, col);
        R(c, cx, sy > 0 ? cy : cy - 2, 1, 3, col);
      }
    }
  }
  // The Restless wait at the edge of the Deep, flickering by the rifts.
  const restless = s.shades.filter((d) => d.kind === 'restless');
  restless.forEach((d, i) => {
    const rf = MAP.rifts[i % MAP.rifts.length];
    const x = rf.x + (i % 2 ? 5 : -5) + Math.round(Math.sin(t * 1.3 + i) * 2);
    if (MF(t * 5 + i) % 4) {
      const o = { silhouette: '#cfe0ff', wisp: true, pose: 'stand', face: i % 2 ? -1 : 1 };
      A(c, 0.35, () => figure(c, x, feet(G.deep), o, t));
      for (const e of eyesAt(x, feet(G.deep), o)) D(c, e.x, e.y, P.silver);
    }
  });
  c.setTransform(1, 0, 0, 1, 0, 0);
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
    const season = s.tuning.year ? (s.season - 1) % LAND.length : 0;
    const sky = skyOf(s);
    if (season === 3) A(u, 0.45 * (1 - sunset), () => bands(u, cx, w, yTop, VEIL, WINTER_SKY));
    if (sky === 'rain') A(u, 0.7 * (1 - sunset), () => bands(u, cx, w, yTop, VEIL, RAIN_SKY));
    A(u, 1 - dk, () => clouds(u, cx, w, t));
    ridge(u, cx, w, RIDGES.far, sunset > 0.5 ? '#7a6a8a' : LAND[season][0]);
    ridge(u, cx, w, RIDGES.near, sunset > 0.5 ? '#5a4a6a' : LAND[season][1]);
    if (dk > 0) {
      A(u, dk, () => {
        ridge(u, cx, w, RIDGES.far, '#141c2a');
        ridge(u, cx, w, RIDGES.near, '#1a2430');
      });
    }
    u.drawImage(L.keep, 0, L.y0);
    if (dk > 0) A(u, dk, () => u.drawImage(L.nightKeep, 0, L.y0));
    if (sunset > 0 && dk < 0.6) A(u, 0.25 * sunset * (1 - dk / 0.6), () => R(u, cx, yTop, w, upH, P.orange));
    dayActors(u, s, t, dk);
    if (season === 3 && sky !== 'rain') A(u, 0.9, () => snow(u, cx, w, yTop, VEIL, t));
    if (sky === 'rain') A(u, 0.55, () => rain(u, cx, w, yTop, VEIL, t, dk > 0.5 ? '#6d7f99' : '#dfe8f2'));
    if (sky === 'fog') fog(u, cx, w, yTop, VEIL, dk > 0.5 ? '#3a4150' : '#dde2e8', 0.55);
    for (const id of s.haunted || []) if (G.rooms[id]) A(u, 1 - dk, () => haunt(u, G.rooms[id], G.floors[G.rooms[id].f].y, t));
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
    if (cy < L.y0 - 18) {
      ellipse(c, 22, L.y0 - 30, 3, 3, P.bone);
      ellipse(c, 23, L.y0 - 31, 2, 2, P.void);
    }
    ridge(c, cx, w, RIDGES.far, '#141c2a');
    ridge(c, cx, w, RIDGES.near, '#1a2430');
    c.drawImage(L.nightKeep, 0, L.y0);
    if (skyOf(s) === 'rain') A(c, 0.45, () => rain(c, cx, w, cy, VEIL, t, '#6d7f99'));
    if (skyOf(s) === 'fog') fog(c, cx, w, cy, VEIL, '#3a4150', 0.5);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  tainBelow(c, w, h, s, v);
  const vy = VEIL - cy;
  if (vy >= 0 && vy < h) {
    R(c, 0, vy, w, 1, P.mauve);
    if (v.veilFlash > 0) A(c, v.veilFlash, () => R(c, 0, vy - 1, w, 3, P.hot));
  }
}

// The Tain under the Veil, as the lake reflects it: by night, and in the eclipse.
function tainBelow(c, w, h, s, v) {
  const L = layers();
  const { x: cx, y: cy } = v.cam;
  const t = v.t;
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
    g.drawImage(composeTain(s, t, v), 0, L.y0);
    c.setTransform(1, 0, 0, -1, 0, h);
    c.drawImage(un, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// The sun gone dark: a black disc in a ring of pale fire.
function darkSun(c, x, y, t) {
  glow(c, x, y, 18, '#e8dcff', 0.16 + 0.04 * Math.sin(t * 1.3));
  ellipse(c, x, y, 8, 8, '#fff2d2');
  ellipse(c, x, y, 7, 7, '#07060d');
}

// The eclipse (round six): both halves at once. Above the Veil the keep at noon under a dark sun, the living at
// work and the Host at the gate; below it the Tain, awake.
function eclipseScene(c, w, h, s, v) {
  const L = layers();
  const { x: cx, y: cy } = v.cam;
  const t = v.t;
  if (VEIL > cy) {
    c.setTransform(1, 0, 0, 1, -cx, -cy);
    bands(c, cx, w, cy, VEIL, ECLIPSE_SKY);
    A(c, 0.6, () => stars(c, cx, w, cy, VEIL - 40, t, '#b8b0e0'));
    darkSun(c, W - 20, Math.min(VEIL - 64, L.y0 - 14), t);
    ridge(c, cx, w, RIDGES.far, '#232a44');
    ridge(c, cx, w, RIDGES.near, '#29324a');
    c.drawImage(L.keep, 0, L.y0);
    A(c, 0.55, () => c.drawImage(L.nightKeep, 0, L.y0));
    dayActors(c, s, t, 0);
    if (skyOf(s) === 'rain') A(c, 0.45, () => rain(c, cx, w, cy, VEIL, t, '#6d7f99'));
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  tainBelow(c, w, h, s, v);
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
  G = geo(s);
  const target = v.flip ? buf('flip', out.width, out.height) : out;
  const c = ctxOf(target);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.clearRect(0, 0, target.width, target.height);
  if (v.eclipse) eclipseScene(c, target.width, target.height, s, v);
  else if (v.night) nightScene(c, target.width, target.height, s, v);
  else dayScene(c, target.width, target.height, s, v);
  if (v.flip) {
    const o = ctxOf(out);
    o.setTransform(1, 0, 0, -1, 0, out.height);
    o.clearRect(0, 0, out.width, out.height);
    o.drawImage(target, 0, 0);
    o.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// A still of the Tain for the night review at dawn: the night as it stood at a moment the sim kept
// (sim.js, keepMoment), cropped to the floors around where it happened and ringed there (a tide has no one
// spot), reflected or upright as the player views it. One canvas pixel per world pixel.
export function drawMoment(out, s, m, v = {}) {
  G = geo(s);
  const L = layers();
  const ghost = { ...s, night: { ...m.frame, spawns: [] }, shades: m.frame.shades };
  const tain = composeTain(ghost, 0, { ambient: 0.22, marks: m.kind === 'tide' ? [] : [{ f: m.f, x: m.x }] });
  const f = Math.max(0, Math.min(G.n - 1, m.f));
  const top = G.floors[Math.max(0, f - 1)].y - 2;
  const h = G.floors[Math.min(G.n - 1, f + 1)].y + ROOM_H + 2 - top;
  out.width = W;
  out.height = h;
  const c = ctxOf(out);
  c.setTransform(1, 0, 0, v.flip ? 1 : -1, 0, v.flip ? 0 : h);
  c.clearRect(0, 0, W, h);
  c.drawImage(tain, 0, top - L.y0, W, h, 0, 0, W, h);
  c.setTransform(1, 0, 0, 1, 0, 0);
}
