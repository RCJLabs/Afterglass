import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creeperEyes, UNLIT_EYES } from '../src/slice/draw.js';
import { eyesAt, FIG_H } from '../src/slice/people.js';
import { UMBRA } from '../src/px/lut.js';

// How a colour looks with each kind of colour vision: Machado, Oliveira and Fernandes (2009), full severity,
// applied to sRGB values. An approximation, but the usual one for checking art.
const CVD = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const see = (m, c) => [0, 1, 2].map((r) => Math.min(1, Math.max(0, m[r * 3] * c[0] + m[r * 3 + 1] * c[1] + m[r * 3 + 2] * c[2])));
const lum = (c) => {
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
function canvas() {
  const px = new Map();
  const c = { fillStyle: '', globalAlpha: 1, fillRect(x, y, w, h) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px.set(`${x + i},${y + j}`, this.fillStyle); } };
  return { c, px };
}

test("a Creeper's eyes stay visible in the dark whatever the colour vision, and aren't shaped like a shade's", () => {
  const room = rgb(UMBRA[3]); // the lightest a dark room of the Tain gets
  for (const [vision, m] of Object.entries(CVD)) {
    const k = contrast(see(m, rgb(UNLIT_EYES.glint)), see(m, room));
    assert.ok(k >= 4.5, `${vision}: the glint's contrast with a dark room is ${k.toFixed(1)}`);
  }
  // Why the glint is there: red alone all but vanishes for someone who can't see red.
  assert.ok(contrast(see(CVD.protanopia, rgb(UNLIT_EYES.red)), see(CVD.protanopia, room)) < 2);

  const { c, px } = canvas();
  creeperEyes(c, { climb: 0, x: 0, gnawing: false }, 50, 40, 0);
  const eyes = [...px.keys()].map((k) => k.split(',').map(Number));
  const cols = [...new Set(eyes.map(([x]) => x))];
  assert.equal(cols.length, 2, 'two eyes');
  for (const x of cols) {
    const ys = eyes.filter(([ex]) => ex === x).map(([, y]) => y).sort((a, b) => a - b);
    assert.deepEqual(ys, [37, 38], 'each an upright mark: a glint over the red');
    assert.equal(px.get(`${x},37`), UNLIT_EYES.glint);
  }
  // A shade's eyes: a level pair, side by side, at head height well above a Creeper's.
  const shade = eyesAt(50, 40, { age: 'adult', face: 1 });
  assert.equal(shade[0].y, shade[1].y);
  assert.equal(Math.abs(shade[0].x - shade[1].x), 1);
  assert.ok(Math.max(...eyes.map(([, y]) => y)) - shade[0].y >= 5, 'a shade looks out from well above a Creeper');
  assert.equal(40 - shade[0].y, FIG_H.adult - 2);
});
