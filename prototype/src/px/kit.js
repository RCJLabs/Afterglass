// The pixel kit from the round-three mockups, as a module: the palette and the drawing primitives.
// Everything draws whole pixels with fillRect on a 2D context at world resolution; the page scales
// the result up with nearest-neighbour so each world pixel stays a crisp square.

// ENDESGA 32, plus three darks the mockups used.
export const P = {
  rust: '#be4a2f', ochre: '#d77643', bone: '#ead4aa', tan: '#e4a672', clay: '#b86f50', brown: '#733e39', plum: '#3e2731',
  crimson: '#a22633', red: '#e43b44', orange: '#f77622', amber: '#feae34', yellow: '#fee761',
  green: '#63c74d', forest: '#3e8948', pine: '#265c42', deep: '#193c3e',
  navy: '#124e89', blue: '#0099db', cyan: '#2ce8f5', white: '#ffffff',
  silver: '#c0cbdc', steel: '#8b9bb4', slate: '#5a6988', indigo: '#3a4466', ink: '#262b44', night: '#181425',
  hot: '#ff0044', grape: '#68386c', mauve: '#b55088', pink: '#f6757a', peach: '#e8b796', skin2: '#c28569',
  void: '#0e0b18', soot: '#1f1a24', earth: '#2a1d18',
};
export const MR = Math.round;
export const MF = Math.floor;

// A tiny seeded generator for art texture only (bricks, specks); game randomness lives in rng.js.
export function rngOf(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function R(c, x, y, w, h, col) {
  w = MR(w);
  h = MR(h);
  if (w <= 0 || h <= 0) return;
  c.fillStyle = col;
  c.fillRect(MR(x), MR(y), w, h);
}
export function D(c, x, y, col) {
  c.fillStyle = col;
  c.fillRect(MR(x), MR(y), 1, 1);
}
export function A(c, a, fn) {
  const o = c.globalAlpha;
  c.globalAlpha = o * a;
  fn();
  c.globalAlpha = o;
}
export function clip(c, x, y, w, h, fn) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  fn();
  c.restore();
}

// Horizontal colour bands, dithered along each seam.
export function sky(c, x, y, w, h, cols) {
  const n = cols.length;
  const bh = h / n;
  for (let i = 0; i < n; i++) R(c, x, y + MF(i * bh), w, Math.ceil(bh) + 1, cols[i]);
  for (let i = 1; i < n; i++) {
    const by = y + MF(i * bh);
    for (let xx = x; xx < x + w; xx++) {
      if ((xx & 1) === 0) D(c, xx, by - 1, cols[i]);
      else D(c, xx, by, cols[i - 1]);
    }
  }
}
export function speck(c, rnd, x, y, w, h, col, d) {
  const n = MR(w * h * d);
  for (let i = 0; i < n; i++) D(c, x + MF(rnd() * w), y + MF(rnd() * h), col);
}
export function bricks(c, rnd, x, y, w, h, o) {
  const bw = o.bw || 6;
  const bh = o.bh || 3;
  clip(c, x, y, w, h, () => {
    R(c, x, y, w, h, o.base);
    for (let row = 0, yy = y; yy < y + h; row++, yy += bh + 1) {
      R(c, x, yy + bh, w, 1, o.dark);
      const off = row & 1 ? MF(bw / 2) + 1 : 0;
      for (let xx = x - off; xx < x + w; xx += bw + 1) {
        R(c, xx + bw, yy, 1, bh, o.dark);
        if (rnd() < 0.45) R(c, xx + 1, yy, 2, 1, o.light);
        if (rnd() < 0.25) D(c, xx + bw - 1, yy + bh - 1, o.dark);
      }
    }
  });
}
export function crenel(c, x, y, w, col, shade) {
  for (let xx = x; xx < x + w - 1; xx += 4) {
    R(c, xx, y - 3, 2, 3, col);
    D(c, xx + 1, y - 3, shade || col);
  }
}
export function roof(c, cx, base, hw, ht, col, shade) {
  for (let i = 0; i < ht; i++) {
    const w = Math.max(1, MR((hw * (i + 1)) / ht));
    R(c, cx - w, base - ht + i, w, 1, col);
    R(c, cx, base - ht + i, w, 1, shade);
  }
  D(c, cx, base - ht - 1, P.amber);
}
export function ellipse(c, cx, cy, rx, ry, col) {
  c.fillStyle = col;
  for (let dy = -ry; dy <= ry; dy++) {
    const w = MR(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    c.fillRect(MR(cx - w), MR(cy + dy), w * 2 + 1, 1);
  }
}
export function ring(c, cx, cy, r, col, keep) {
  r = MR(r);
  if (r < 1) return;
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    for (const [dx, dy] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) if (!keep || keep(dx, dy)) D(c, cx + dx, cy + dy, col);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}
export function room(c, rnd, x, y, w, h, o) {
  R(c, x, y, w, h, o.wall);
  speck(c, rnd, x, y, w, h - 2, o.wall2, 0.06);
  R(c, x, y, w, 1, o.wall2);
  R(c, x, y + h - 2, w, 2, o.floor);
  R(c, x, y + h - 2, w, 1, o.floorTop || o.floor);
}
export function flame(c, x, y, t, s, cols = [P.yellow, P.amber, P.orange]) {
  const f = MF(t * 9 + (s || 0)) % 3;
  D(c, x, y, cols[0]);
  D(c, x, y - 1, f === 0 ? cols[1] : cols[0]);
  if (f !== 2) D(c, x, y - 2, cols[2]);
  if (f === 1) D(c, x + 1, y - 1, cols[2]);
  if (f === 2) D(c, x - 1, y - 1, cols[2]);
}
export function glow(c, x, y, r, col, a) {
  for (let i = 0; i < 3; i++) {
    const rr = MR(r * (1 - i / 3));
    if (rr > 0) A(c, a * 0.45, () => ellipse(c, x, y, rr, rr, col));
  }
}

// A person, 4 wide and h tall (default 8), standing with feet on row y. Options pick clothes and props.
export function human(c, x, y, o, t) {
  const h = o.h || 8;
  const top = y - h;
  const ph = o.ph || 0;
  const walking = o.walk && MF(t * o.walk + ph) % 2 === 1;
  const legs = o.legs || P.ink;
  if (walking) {
    D(c, x, y - 2, legs);
    D(c, x, y - 1, legs);
    D(c, x + 3, y - 2, legs);
    D(c, x + 3, y - 1, legs);
    R(c, x + 1, y - 2, 2, 1, legs);
  } else R(c, x + 1, y - 2, 2, 2, legs);
  R(c, x, top + 2, 4, h - 4, o.body);
  if (o.robe) R(c, x, top + 2, 4, h - 3, o.body);
  if (o.trim) R(c, x, top + h - 4, 4, 1, o.trim);
  R(c, x + 1, top, 2, 2, o.skin || P.peach);
  if (o.hair) R(c, x + 1, top, 2, 1, o.hair);
  if (o.helm) {
    R(c, x, top, 4, 1, o.helm);
    R(c, x + 1, top - 1, 2, 1, o.helm);
  }
  if (o.hood) {
    R(c, x, top - 1, 4, 1, o.hood);
    D(c, x, top, o.hood);
    D(c, x + 3, top, o.hood);
    D(c, x, top + 1, o.hood);
    D(c, x + 3, top + 1, o.hood);
  }
  if (o.horns) {
    D(c, x, top - 1, P.bone);
    D(c, x + 3, top - 1, P.bone);
  }
  if (o.eyes) {
    D(c, x + 1, top + 1, o.eyes);
    D(c, x + 2, top + 1, o.eyes);
  }
  if (o.carry) R(c, x, top - 2, 4, 2, o.carry);
  if (o.spear) {
    const sx = (o.face || 1) > 0 ? x + 4 : x - 1;
    R(c, sx, top - 3, 1, h + 1, P.clay);
    D(c, sx, top - 4, P.silver);
  }
}
