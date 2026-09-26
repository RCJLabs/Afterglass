// Draws the season's app icons as pixel art and writes them as PNGs, with no dependencies.
// Usage: node tools/icons.mjs   (writes icons/*.png; the files are committed, so this only runs when the art changes)
// The art is 32 by 32: the keep standing on the Veil at night, its windows lit, and under the line its
// reflection, the Tain, lit by candles. Every size is a whole-number scale of it, so the pixels stay square.
// The maskable icon and the apple-touch icon carry the art on a wider background (each row's colour
// carried out to the edge), so a launcher's circle or rounded square crops sky, never the keep.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const N = 32;
const VEIL = 16;

// Colours from the game's palette (src/px/kit.js) and the Tain's.
const COL = {
  night: '#181425', star: '#8b9bb4',
  stone: '#5a6988', lit: '#8b9bb4', wall: '#3a4466', roof: '#e43b44', roofShade: '#a22633',
  window: '#feae34', glint: '#fee761', gate: '#181425',
  veil: '#b55088',
  tain: '#0e0b18', tainStar: '#2a1d45', ripple: '#1b1430',
  tStone: '#4a3a52', tLit: '#68386c', tWall: '#3e2731', tRoof: '#b55088', tRoofShade: '#68386c',
  candle: '#f0b0ff', flame: '#ffffff', tGate: '#050308',
};
// The reflection's colour for each colour above the Veil.
const TAIN = {
  night: 'tain', star: 'tainStar', stone: 'tStone', lit: 'tLit', wall: 'tWall',
  roof: 'tRoof', roofShade: 'tRoofShade', window: 'candle', glint: 'flame', gate: 'tGate',
};

// The keep above the Veil, rows 0 to 15.
const up = Array.from({ length: VEIL }, () => Array(N).fill('night'));
const sky = up.map((row) => row[0]);
const rect = (x, y, w, h, c) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) up[j][i] = c;
};
// Both sides at once, mirrored about the keep's middle.
const pair = (x, y, w, h, c) => {
  rect(x, y, w, h, c);
  rect(N - x - w, y, w, h, c);
};

for (const [x, y] of [[2, 1], [28, 2], [30, 7], [1, 10], [11, 0], [21, 1]]) up[y][x] = 'star';
rect(9, 8, 14, 8, 'wall'); // curtain walls between the towers
pair(10, 7, 1, 1, 'wall'); // their merlons
pair(5, 5, 4, 11, 'stone'); // the two towers
rect(12, 3, 8, 13, 'stone'); // the keep's great tower
pair(12, 2, 2, 1, 'stone'); // its merlons
rect(15, 2, 2, 1, 'stone');
// Pointed roofs on the towers, lit from the left.
for (const [y, x, w] of [[1, 6, 2], [2, 5, 4], [3, 4, 6]]) pair(x, y, w, 1, 'roof');
pair(4, 4, 6, 1, 'roofShade');
for (const x0 of [4, 22]) for (let y = 1; y <= 3; y++) for (let x = x0 + 3; x < x0 + 6; x++) if (up[y][x] === 'roof') up[y][x] = 'roofShade';
// Light on the left edges.
rect(5, 5, 1, 11, 'lit');
rect(23, 5, 1, 11, 'lit');
rect(12, 3, 1, 13, 'lit');
up[2][12] = 'lit';
// Windows.
pair(14, 4, 1, 2, 'window');
rect(15, 7, 2, 3, 'window');
rect(15, 8, 2, 1, 'glint');
pair(6, 7, 2, 2, 'window');
pair(6, 11, 2, 2, 'window');
up[7][6] = up[7][24] = up[11][6] = up[11][24] = 'glint';
pair(10, 10, 1, 2, 'window');
// The gate.
rect(14, 12, 4, 4, 'gate');
rect(15, 11, 2, 1, 'gate');

// The whole picture: the keep, the Veil, and the Tain (row VEIL + k reflects row VEIL - k).
const art = [];
const bg = [];
for (let y = 0; y < N; y++) {
  if (y < VEIL) {
    art.push(up[y].map((c) => COL[c]));
    bg.push(COL[sky[y]]);
  } else if (y === VEIL) {
    art.push(Array(N).fill(COL.veil));
    bg.push(COL.veil);
  } else {
    const src = 2 * VEIL - y;
    art.push(up[src].map((c) => COL[TAIN[c]]));
    bg.push(COL[TAIN[sky[src]]]);
  }
}
// Faint ripples on the Tain's open water.
for (const [x, y, w] of [[1, 19, 3], [28, 19, 3], [2, 23, 2], [27, 22, 3], [0, 27, 3], [29, 28, 3]]) {
  for (let i = x; i < x + w; i++) if (art[y][i] === bg[y]) art[y][i] = COL.ripple;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// size: the square's side; scale: pixels per art pixel. The art sits in the middle; the rest is background.
function picture(size, scale) {
  const px = Buffer.alloc(size * size * 4);
  const off = (size - N * scale) / 2;
  if (off !== Math.floor(off)) throw new Error(`icons: ${size} does not centre the art at scale ${scale}`);
  for (let y = 0; y < size; y++) {
    const ay = Math.floor((y - off) / scale);
    const row = Math.min(N - 1, Math.max(0, ay));
    for (let x = 0; x < size; x++) {
      const ax = Math.floor((x - off) / scale);
      const inside = ay >= 0 && ay < N && ax >= 0 && ax < N;
      const [r, g, b] = rgb(inside ? art[ay][ax] : bg[row]);
      px.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return png(size, size, px);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); // filter 0 on every row
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The maskable icon keeps the keep inside the middle 80% circle that every launcher mask leaves: at scale 11
// the farthest corner of a roof is 203 pixels from the centre of 512, inside the safe radius of 204.8.
const OUT = [
  ['icon-192.png', 192, 6],
  ['icon-512.png', 512, 16],
  ['icon-maskable-512.png', 512, 11],
  ['apple-touch-icon.png', 180, 5],
  ['favicon-32.png', 32, 1],
];
mkdirSync(resolve(root, 'icons'), { recursive: true });
for (const [name, size, scale] of OUT) {
  const file = picture(size, scale);
  writeFileSync(resolve(root, 'icons', name), file);
  console.log(`icons/${name}: ${size}x${size}, ${file.length} bytes`);
}
