// The recap card as an image: 1080 by 1350, the keep as it stands drawn by the game's own renderer in whole
// pixels, and what recap.js says about the season. Browser only: it needs a canvas and the page's fonts.

import { drawScene } from './draw.js';
import { geo } from './geo.js';
import { MAP } from './data.js';

export const CARD_W = 1080;
export const CARD_H = 1350;
// The page's dark theme.
const C = { ground: '#121118', box: '#201f2a', line: '#363443', line2: '#4f4c61', ink: '#ebe9f3', ink2: '#b4b0c6', ink3: '#9591a8', gold: '#ebbd6e', bad: '#ff7d6c' };
const HEAD = '"Alegreya SC", Georgia, serif';
const BODY = '"Atkinson Hyperlegible", system-ui, sans-serif';
const NUM = '"Spline Sans Mono", ui-monospace, monospace';

// Waits, briefly, for the page's fonts, so the card doesn't come out in fallbacks.
export async function cardFonts() {
  if (!document.fonts?.load) return;
  const want = [`700 60px ${HEAD}`, `400 30px ${BODY}`, `700 26px ${BODY}`, `600 34px ${NUM}`];
  await Promise.race([Promise.all(want.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
}

// Sets the largest font up to size px at which the text fits maxW.
function fitFont(c, text, font, size, maxW) {
  let px = size;
  c.font = font(px);
  while (px > 12 && c.measureText(text).width > maxW) c.font = font(--px);
  return px;
}

// The keep as it stands, filling a box: the day scene (darkened for a fallen keep) framed on the keep from
// just above its roof to a little of the lake, at the largest whole scale that fits.
function keepArt(s, stood, bw, bh) {
  const G = geo(s);
  const y0 = G.top - 36;
  const y1 = MAP.VEIL + 20;
  const k = Math.max(1, Math.floor(Math.min(bw / (MAP.W + 16), bh / (y1 - y0))));
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(bw / k);
  cv.height = Math.ceil(bh / k);
  const cam = { x: Math.round(MAP.W / 2 - cv.width / 2), y: Math.round((y0 + y1) / 2 - cv.height / 2) };
  drawScene(cv, s, { night: false, flip: false, cam, t: 0, sunset: stood ? 0.35 : 0, dusk: stood ? 0 : 0.85, souls: [], ambient: 0.22, veilFlash: 0 });
  return { cv, k };
}

export function drawCard(out, s, r) {
  out.width = CARD_W;
  out.height = CARD_H;
  const c = out.getContext('2d');
  const mid = CARD_W / 2;
  c.fillStyle = C.ground;
  c.fillRect(0, 0, CARD_W, CARD_H);
  c.strokeStyle = C.line;
  c.lineWidth = 4;
  c.strokeRect(20, 20, CARD_W - 40, CARD_H - 40);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'center';
  c.fillStyle = C.gold;
  c.font = `700 60px ${HEAD}`;
  c.fillText('Afterglass', mid, 96);
  c.fillStyle = C.ink2;
  const sub = r.daily ? `The keep of ${r.daily} · ${r.title}` : r.title;
  fitFont(c, sub, (px) => `400 ${px}px ${BODY}`, 30, 900);
  c.fillText(sub, mid, 140);

  // The keep.
  const box = { x: 60, y: 168, w: 960, h: 600 };
  const art = keepArt(s, r.stood, box.w, box.h);
  c.save();
  c.beginPath();
  c.rect(box.x, box.y, box.w, box.h);
  c.clip();
  c.imageSmoothingEnabled = false;
  c.drawImage(art.cv, box.x, box.y, art.cv.width * art.k, art.cv.height * art.k);
  c.restore();
  c.strokeStyle = C.line2;
  c.lineWidth = 3;
  c.strokeRect(box.x - 1.5, box.y - 1.5, box.w + 3, box.h + 3);

  // How it went.
  c.fillStyle = r.stood ? C.ink : C.bad;
  c.font = `700 64px ${HEAD}`;
  c.fillText(r.head, mid, 838);
  c.fillStyle = C.ink2;
  fitFont(c, r.sub, (px) => `400 ${px}px ${BODY}`, 30, 900);
  c.fillText(r.sub, mid, 884);

  // The numbers, three to a row.
  const gap = 16;
  const tw = (960 - 2 * gap) / 3;
  const th = 90;
  r.stats.forEach(([label, value], i) => {
    const x = 60 + (i % 3) * (tw + gap);
    const y = 910 + Math.floor(i / 3) * (th + 14);
    c.fillStyle = C.box;
    c.fillRect(x, y, tw, th);
    c.strokeStyle = C.line;
    c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, tw - 2, th - 2);
    c.textAlign = 'left';
    c.fillStyle = C.ink3;
    fitFont(c, label.toUpperCase(), (px) => `700 ${px}px ${BODY}`, 19, tw - 36);
    c.fillText(label.toUpperCase(), x + 18, y + 32);
    c.fillStyle = C.ink;
    fitFont(c, value, (px) => `600 ${px}px ${NUM}`, 34, tw - 36);
    c.fillText(value, x + 18, y + 74);
  });

  // Who is remembered.
  c.textAlign = 'left';
  c.fillStyle = C.ink3;
  c.font = `700 19px ${BODY}`;
  c.fillText(r.remembered.length ? 'REMEMBERED' : 'NO ONE DIED, AND NO SHADE SERVED', 60, 1146);
  r.remembered.forEach((m, i) => {
    const y = 1184 + i * 36;
    // The name in bold and the rest plain, together no wider than the card allows.
    const widthAt = (px) => {
      c.font = `700 ${px}px ${BODY}`;
      const a = c.measureText(m.name).width;
      c.font = `400 ${px}px ${BODY}`;
      return a + c.measureText(` — ${m.line}`).width;
    };
    let size = 26;
    while (size > 14 && widthAt(size) > 960) size--;
    c.font = `700 ${size}px ${BODY}`;
    c.fillStyle = C.ink;
    c.fillText(m.name, 60, y);
    const w = c.measureText(m.name).width;
    c.font = `400 ${size}px ${BODY}`;
    c.fillStyle = C.ink2;
    c.fillText(` — ${m.line}`, 60 + w, y);
  });

  // Where it's from, and the keep's seed.
  c.fillStyle = C.ink3;
  c.font = `400 20px ${BODY}`;
  c.fillText('rcjlabs.github.io/Afterglass', 60, 1300);
  c.textAlign = 'right';
  c.font = `400 20px ${NUM}`;
  c.fillText(`Seed ${r.seed}`, CARD_W - 60, 1300);
}
