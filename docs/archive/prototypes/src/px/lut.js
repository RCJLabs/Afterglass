// The palette lookup that turns day art into the Tain, and the dithered candlelight. Pure functions on
// RGBA arrays, so they run (and are tested) in Node as well as in the browser.

// The Tain's ramp, dark to light. Day art keeps its shapes and trades its colours for these.
export const UMBRA = ['#0e0b18', '#1b1430', '#2a1d45', '#3e2a5c', '#5b3a7a', '#7d4f9e', '#a36ac0', '#d9a6ff'];
export const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const UMBRA_RGB = UMBRA.map(hex2rgb);
export const luma = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

// Day colour to Tain colour: by brightness onto the ramp. Warm lights (lamps, flames, gold) become its
// brightest violet, so a lit window by day is still the brightest thing in its twin.
export function tainIndex(r, g, b) {
  if (r > 200 && g > 150 && b < 120) return UMBRA.length - 1;
  return Math.min(UMBRA.length - 2, Math.floor((luma(r, g, b) / 256) * 7.2));
}
export const tainRGB = (r, g, b) => UMBRA_RGB[tainIndex(r, g, b)];

// Recolours every opaque pixel of an RGBA buffer in place.
export function applyTain(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const [r, g, b] = tainRGB(data[i], data[i + 1], data[i + 2]);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// Ordered dithering: a light level from 0 to 1 becomes one of four bands, darkened toward the night.
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const BANDS = [0.2, 0.45, 0.72, 1];
export const NIGHT = [7, 5, 12];
export const band = (L, x, y) => Math.max(0, Math.min(3, Math.floor(L * 3 + BAYER[(y & 3) * 4 + (x & 3)])));

// Darkens an RGBA buffer by lightAt(x, y) in [0, 1]; (x, y) are world pixels, y offset by y0.
export function applyLight(data, w, h, lightAt, y0 = 0) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!data[i + 3]) continue;
      const q = band(lightAt(x, y + y0), x, y + y0);
      if (q === 3) continue;
      const f = BANDS[q];
      data[i] = Math.round(data[i] * f + NIGHT[0] * (1 - f));
      data[i + 1] = Math.round(data[i + 1] * f + NIGHT[1] * (1 - f));
      data[i + 2] = Math.round(data[i + 2] * f + NIGHT[2] * (1 - f));
    }
  }
}
