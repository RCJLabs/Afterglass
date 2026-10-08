import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UMBRA, hex2rgb, luma, tainIndex, applyTain, band, applyLight, NIGHT } from '../src/px/lut.js';
import { P } from '../src/px/kit.js';

// The colour lookup the season draws the Tain and candlelight with (src/px/lut.js), from the weeks 5–6 pixel
// pass, whose other tests went with it into docs/archive/prototypes (round seven, phase 19).
test('the palette lookup sends every day colour onto the Tain ramp, darker stays darker', () => {
  const cols = Object.values(P).map(hex2rgb);
  for (const c of cols) assert.ok(tainIndex(...c) >= 0 && tainIndex(...c) < UMBRA.length);
  assert.equal(tainIndex(...hex2rgb(P.amber)), UMBRA.length - 1, 'warm light becomes the brightest violet');
  assert.equal(tainIndex(...hex2rgb(P.yellow)), UMBRA.length - 1);
  const cool = cols.filter(([r, g, b]) => !(r > 200 && g > 150 && b < 120)).sort((a, b) => luma(...a) - luma(...b));
  for (let i = 1; i < cool.length; i++) assert.ok(tainIndex(...cool[i]) >= tainIndex(...cool[i - 1]), 'monotonic in brightness');
  const buf = new Uint8ClampedArray([255, 255, 255, 255, 10, 20, 30, 0]);
  applyTain(buf);
  assert.deepEqual([...buf.slice(0, 3)], hex2rgb(UMBRA[6]));
  assert.deepEqual([...buf.slice(4)], [10, 20, 30, 0], 'transparent pixels untouched');
});

test('candlelight dithers into four bands and darkens toward the night', () => {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      assert.equal(band(1, x, y), 3);
      assert.equal(band(0, x, y), 0);
    }
  }
  const mid = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) mid.add(band(0.5, x, y));
  assert.deepEqual([...mid].sort(), [1, 2], 'a half-lit wall mixes two bands');
  const buf = new Uint8ClampedArray([200, 200, 200, 255]);
  applyLight(buf, 1, 1, () => 0);
  assert.deepEqual([...buf.slice(0, 3)], [200 * 0.2 + NIGHT[0] * 0.8, 200 * 0.2 + NIGHT[1] * 0.8, 200 * 0.2 + NIGHT[2] * 0.8].map(Math.round));
});
