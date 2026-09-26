// The pixel keep's geometry, the two night cameras, the candlelight model and the readability quiz.
// Pure: no canvas, so the rules the renderer and the quiz share can be tested in Node.

import { rand, randInt, pick } from '../rng.js';

// A small keep: two rows of two rooms on the Veil (the waterline at row VEIL). World pixels.
export const WORLD = { W: 112, VEIL: 92 };
// Night views show the whole Tain plus 8 rows on the far side of the Veil.
export const VIEW_H = WORLD.VEIL + 8;

// Four room pairs. Positions are the day keep's; the Tain uses the same layout, reflected.
export const ROOMS = [
  { id: 'chapel', day: 'Chapel', night: 'Choir of Echoes', x: 6, y: 46, w: 48, h: 20 },
  { id: 'granary', day: 'Granary', night: 'Hollow Granary', x: 58, y: 46, w: 48, h: 20 },
  { id: 'hearth', day: 'Hearth', night: 'Cold Hearth', x: 6, y: 68, w: 48, h: 20 },
  { id: 'crypt', day: 'Crypt', night: 'Waking Room', x: 58, y: 68, w: 48, h: 20 },
];
export const room = (id) => ROOMS.find((r) => r.id === id);
export const feet = (r) => r.y + r.h - 2; // the row people stand on
export const roomAt = (x, y) => ROOMS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
export const twinY = (y) => 2 * WORLD.VEIL - 1 - y;

// The two night cameras. Tain objects are placed in upright coordinates (the day keep's layout).
// 'reflection' shows the Tain as the world has it: mirrored below the Veil, everyone hanging upside down.
// 'flipped' turns that view over so the Tain reads upright, with the Veil along the bottom.
export const MODES = ['reflection', 'flipped'];
export const toView = (mode, x, y) => ({ x, y: mode === 'reflection' ? WORLD.VEIL + 7 - y : y });
export const fromView = (mode, vx, vy) => ({ x: vx, y: mode === 'reflection' ? WORLD.VEIL + 7 - vy : vy });

// Candlelight: full near the flame, fading to nothing LIGHT.R pixels out, inside its own room only
// (walls stop it). gain > 1 gives the pool a bright core instead of a single bright pixel.
export const LIGHT = { R: 20, gain: 1.5, ambient: 0.18, lit: 0.5, dark: 0.22 };
export const flamePoint = (c) => ({ x: c.x, y: feet(room(c.room)) - 5 });
export const candleLight = (d, k = 1) => Math.max(0, Math.min(1, LIGHT.gain * k * (1 - d / LIGHT.R)));
export function lightAt(scene, x, y) {
  const r = roomAt(x, y);
  let L = LIGHT.ambient;
  if (!r) return L;
  for (const c of scene.candles) {
    if (c.room !== r.id) continue;
    const p = flamePoint(c);
    L = Math.max(L, candleLight(Math.hypot(x - p.x, y - p.y)));
  }
  return L;
}
export const chest = (s) => ({ x: s.x + 2, y: feet(room(s.room)) - 5 });
export const shadeLight = (scene, s) => {
  const p = chest(s);
  return lightAt(scene, p.x, p.y);
};

// Sprite boxes in upright coordinates, for hit tests.
export const shadeBox = (s) => ({ x: s.x - 1, y: feet(room(s.room)) - 10, w: 6, h: 10 });
export const creeperBox = (c) => ({ x: c.x - 1, y: feet(room(c.room)) - 4, w: 9, h: 5 });
const inBox = (b, p, tol) => p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
const inRoom = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

/* ---------------------------------------------------------------- the readability quiz */

export const QUESTION_TYPES = ['room', 'dark', 'caught', 'unlit', 'creeper', 'count'];
const NAMES = ['Ada', 'Tam', 'Bran', 'Hesk', 'Mira', 'Nell', 'Osk', 'Sabe', 'Wil', 'Corra', 'Idris', 'Lune'];
const KINDS = ['loyal', 'serene', 'pale', 'stranger'];
const SPACING = 7;

function occupied(scene, roomId) {
  return [...scene.shades, ...scene.creepers].filter((u) => u.room === roomId).map((u) => u.x);
}
// gap: how far other sprites must stand. Creepers, and shades a Creeper will cling to, need more room
// so a tap aimed at them can't land on a neighbour.
function fits(scene, r, x, gap) {
  return x >= r.x + 3 && x <= r.x + r.w - 7 && occupied(scene, r.id).every((o) => Math.abs(o - x) >= gap) && scene.candles.every((c) => c.room !== r.id || Math.abs(c.x - x) >= 3);
}
// A spot for a shade or Creeper whose light satisfies test; null if the room has none.
function spot(g, scene, r, test, gap = SPACING) {
  for (let i = 0; i < 60; i++) {
    const x = r.x + 3 + randInt(g, r.w - 9);
    if (!fits(scene, r, x, gap)) continue;
    if (test(lightAt(scene, x + 2, feet(r) - 5))) return x;
  }
  return null;
}
const WIDE = 14;
const isLit = (L) => L >= LIGHT.lit;
const isDark = (L) => L <= LIGHT.dark;

function addShade(g, scene, r, test, gap) {
  const x = spot(g, scene, r, test, gap);
  if (x === null) return null;
  const s = { id: `s${scene.shades.length + 1}`, name: NAMES[scene.shades.length % NAMES.length], kind: pick(g, KINDS), room: r.id, x };
  scene.shades.push(s);
  return s;
}
function addCreeper(g, scene, r, test, x) {
  const at = x ?? spot(g, scene, r, test, WIDE);
  if (at === null) return null;
  const c = { id: `c${scene.creepers.length + 1}`, room: r.id, x: at };
  scene.creepers.push(c);
  return c;
}
// One candle near one end of a room, so the far end stays dark.
function light(g, scene, r) {
  const end = rand(g) < 0.5;
  const x = end ? r.x + 5 + randInt(g, 6) : r.x + r.w - 6 - randInt(g, 6);
  scene.candles.push({ room: r.id, x });
}

// Builds one question's night scene. Every question has exactly one right answer.
export function makeQuestion(seed, type) {
  const g = { rng: seed >>> 0 };
  const scene = { candles: [], shades: [], creepers: [] };
  let answer;
  let prompt;
  const rooms = [...ROOMS];
  const dark = type === 'unlit' ? pick(g, rooms) : null;
  for (const r of rooms) if (r !== dark) light(g, scene, r);
  const others = (n, avoid) => {
    for (let i = 0; i < n; i++) addShade(g, scene, pick(g, rooms.filter((r) => r !== dark && r !== avoid)), isLit);
  };

  if (type === 'room') {
    const r = pick(g, rooms);
    others(2 + randInt(g, 3));
    answer = { room: r.id };
    prompt = `Tap the ${r.night}.`;
  } else if (type === 'dark') {
    others(2 + randInt(g, 2));
    let s = null;
    for (const r of [...rooms].sort(() => rand(g) - 0.5)) if ((s = addShade(g, scene, r, isDark))) break;
    answer = { shade: s.id };
    prompt = 'Tap the shade standing in the dark.';
  } else if (type === 'caught') {
    others(2 + randInt(g, 2));
    let s = null;
    for (const r of [...rooms].sort(() => rand(g) - 0.5)) if ((s = addShade(g, scene, r, isDark, WIDE))) break;
    const c = { id: 'c1', room: s.room, x: s.x + 1, grab: s.id };
    scene.creepers.push(c);
    answer = { shade: s.id, creeper: c.id };
    prompt = 'Tap the shade a Creeper has caught.';
  } else if (type === 'unlit') {
    others(2 + randInt(g, 3), dark);
    answer = { room: dark.id };
    prompt = 'Tap the room with no candle.';
  } else if (type === 'creeper') {
    others(2 + randInt(g, 3));
    let c = null;
    for (const r of [...rooms].sort(() => rand(g) - 0.5)) if ((c = addCreeper(g, scene, r, (L) => L < LIGHT.lit))) break;
    answer = { creeper: c.id };
    prompt = 'Tap the Creeper.';
  } else if (type === 'count') {
    const choir = room('chapel');
    const k = randInt(g, 4);
    for (let i = 0; i < k; i++) addShade(g, scene, choir, isLit);
    const inChoir = scene.shades.length;
    others(1 + randInt(g, 3), choir);
    answer = { count: inChoir };
    prompt = `How many shades are in the ${choir.night}?`;
  } else {
    throw new Error(`Unknown question type: ${type}`);
  }
  return { type, seed: seed >>> 0, scene, answer, prompt };
}

// True if a tap at view pixel (vx, vy) answers the question; for count questions pass { count }.
export function isRight(q, mode, tap) {
  if ('count' in q.answer) return tap.count === q.answer.count;
  const p = fromView(mode, tap.x, tap.y);
  const tol = 2;
  if (q.answer.room) return inRoom(room(q.answer.room), p);
  if (q.answer.shade) {
    if (inBox(shadeBox(q.scene.shades.find((s) => s.id === q.answer.shade)), p, tol)) return true;
    if (q.answer.creeper) return inBox(creeperBox(q.scene.creepers.find((c) => c.id === q.answer.creeper)), p, tol);
    return false;
  }
  return inBox(creeperBox(q.scene.creepers.find((c) => c.id === q.answer.creeper)), p, tol);
}

// Twelve questions: each type once in each camera, shuffled, with seeds drawn from the session seed.
export function makeQuiz(seed) {
  const g = { rng: seed >>> 0 };
  const plan = [];
  for (const type of QUESTION_TYPES) for (const mode of MODES) plan.push({ type, mode, seed: (Math.floor(rand(g) * 4294967296) >>> 0) || 1 });
  for (let i = plan.length - 1; i > 0; i--) {
    const j = randInt(g, i + 1);
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((p, q) => p - q);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
// Accuracy and median answer time per camera, and accuracy per question type per camera.
export function summarize(results) {
  const byMode = {};
  for (const mode of MODES) {
    const rs = results.filter((r) => r.mode === mode);
    byMode[mode] = { n: rs.length, right: rs.filter((r) => r.right).length, medianMs: median(rs.map((r) => r.ms)) };
  }
  const byType = {};
  for (const type of QUESTION_TYPES) {
    byType[type] = {};
    for (const mode of MODES) {
      const rs = results.filter((r) => r.type === type && r.mode === mode);
      byType[type][mode] = rs.length ? { right: rs.filter((r) => r.right).length, n: rs.length, ms: median(rs.map((r) => r.ms)) } : null;
    }
  }
  return { byMode, byType };
}

// The scene the Night view shows: the weeks 1–2 cast at their posts, one room left dark.
export const SHOWCASE = {
  candles: [{ room: 'chapel', x: 22 }, { room: 'hearth', x: 12 }, { room: 'crypt', x: 96 }, { room: 'crypt', x: 72 }],
  shades: [
    { id: 's1', name: 'Tam', kind: 'serene', room: 'chapel', x: 14 },
    { id: 's2', name: 'Bran', kind: 'pale', room: 'chapel', x: 27 },
    { id: 's3', name: 'Mira', kind: 'loyal', room: 'hearth', x: 17 },
    { id: 's4', name: 'Ada', kind: 'loyal', room: 'crypt', x: 76, fresh: true },
    { id: 's5', name: 'Hesk', kind: 'stranger', room: 'crypt', x: 88 },
  ],
  creepers: [{ id: 'c1', room: 'granary', x: 74, patrol: [62, 98] }, { id: 'c2', room: 'hearth', x: 42, patrol: [36, 48] }],
};
