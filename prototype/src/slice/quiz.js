// The glass test (round seven, phase 5): round three's readability quiz, on the season's own Tain. Eight
// stills of a small keep's Tain at night, four as the lake shows it (reflected) and four turned upright, each
// asking one thing: tap one of the Unlit, tap the shade in the dark, tap the shade that's been caught, or say
// how many of the Unlit there are. Right or wrong and how long each took, per camera, say which reads better
// on a phone. Pure: the page draws each scene with drawMoment and judges a tap here, so the rules can be
// tested in Node.

import { newSeason, act } from './sim.js';
import { geo, feet, lightMap, isLit } from './geo.js';

export const QUIZ_TYPES = ['creeper', 'dark', 'caught', 'count'];
export const QUIZ_CAMS = ['reflection', 'flipped'];
export const QUIZ_ASK = {
  creeper: 'Tap one of the Unlit.',
  dark: 'Tap the shade standing in the dark.',
  caught: 'Tap the shade the Unlit have caught.',
  count: 'How many of the Unlit are there?',
};
export const COUNT_CHOICES = [1, 2, 3, 4, 5];
const KEEP_SEED = 20260928;
const NAMES = ['Ada', 'Tam', 'Bran', 'Hesk', 'Mira', 'Nell', 'Osk', 'Sabe', 'Wil', 'Corra', 'Idris', 'Lune'];
const KINDS = ['loyal', 'serene', 'pale', 'stranger'];
const GAP = 9; // the least room between two figures on a floor, so a tap can't land between them unjudged
const REACH = 8; // how far from a figure a tap still counts as on it, in the Tain's pixels

// The keep every scene is drawn in: three floors, the tutorial's rooms. The same for everyone.
export function quizKeep() {
  const s = newSeason(KEEP_SEED, { weather: 0 });
  s.res.stone = 99;
  for (const room of ['barracks', 'chandlery', 'chapel', 'glazier']) act(s, { type: 'raise', room });
  return s;
}

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, n) => Math.floor(r() * n);
function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Eight questions: each kind once in each camera, in an order drawn from the tester's own seed, so the
// order's effect averages out over testers. Each scene has a seed of its own.
export function quizPlan(seed) {
  const r = rng(seed);
  const plan = [];
  for (const type of QUIZ_TYPES) for (const cam of QUIZ_CAMS) plan.push({ type, cam, seed: (Math.floor(r() * 4294967296) >>> 0) || 1 });
  return shuffle(r, plan);
}

// Where a figure's middle is, in the keep's pixels (the Tain upright): a shade stands 12 tall on its floor,
// a Creeper crouches 3.
export const centre = (G, u) => ({ x: u.x + 0.5, y: feet(G, u.f) - (u.shade ? 6 : 2) });

// One scene: the frame drawMoment draws (candles, foes, shades), the floor it centres on, and the answer.
// Rooms are the unit of light: a candle lights its own room only, so a shade is in the dark exactly when
// no candle stands in its room within reach.
export function quizScene(base, q) {
  const G = geo(base);
  const T = base.tuning;
  const r = rng(q.seed);
  const rooms = shuffle(r, Object.values(G.rooms).map((m) => ({ id: m.id, f: m.f, x0: m.x0, x1: m.x1 })));
  const avoid = (f) => [...G.stairs.filter((st) => st.f === f).map((st) => st.x), ...(f === G.deep ? G.rifts.map((k) => k.x) : []), ...(f === G.veil ? G.mirrors.map((k) => k.x) : [])];
  const taken = {};
  // A free spot in a room, away from the stairs, the rifts, the mirrors and anyone already there.
  const spot = (m, near) => {
    for (let i = 0; i < 80; i++) {
      const x = near != null ? near : m.x0 + 5 + int(r, m.x1 - m.x0 - 11);
      if (x < m.x0 + 4 || x > m.x1 - 6) return null;
      if (avoid(m.f).some((a) => Math.abs(a - x) < 6)) { if (near != null) return null; continue; }
      if ((taken[m.f] || []).some((o) => Math.abs(o - x) < GAP)) { if (near != null) return null; continue; }
      (taken[m.f] ||= []).push(x);
      return x;
    }
    return null;
  };
  const names = shuffle(r, [...NAMES]);
  const shades = [];
  const foes = [];
  const candles = [];
  const shade = (m, extra = {}) => {
    const x = spot(m);
    if (x == null) return null;
    const d = { id: `q${shades.length + 1}`, name: names[shades.length], kind: KINDS[int(r, KINDS.length)], mirror: 'm1', f: m.f, x, of: m.f, ox: x, path: [], ...extra };
    shades.push(d);
    return d;
  };
  const creeper = (m, at) => {
    const x = at != null ? spot(m, at) : spot(m);
    if (x == null) return null;
    const u = { id: `u${foes.length + 1}`, type: 'creeper', f: m.f, x, of: m.f, ox: x, path: [] };
    foes.push(u);
    return u;
  };
  const light = (m, d) => {
    if (!d) return;
    const x = Math.max(m.x0 + 2, Math.min(m.x1 - 2, d.x + (r() < 0.5 ? -5 : 5)));
    candles.push({ id: `k${candles.length + 1}`, f: m.f, x, wax: T.candleWax, max: T.candleWax });
  };
  // Rooms taken in turn: the first for the question's own figure, then lit rooms, then dark ones.
  const [first, ...rest] = rooms;
  let answer;
  if (q.type === 'creeper') {
    for (const m of rest.slice(0, 2 + int(r, 2))) light(m, shade(m));
    const dark = rooms.filter((m) => !candles.some((k) => k.f === m.f && k.x >= m.x0 && k.x <= m.x1));
    creeper(dark[0]);
    if (r() < 0.5 && dark[1]) creeper(dark[1]);
    answer = foes.map((u) => u.id);
  } else if (q.type === 'dark') {
    const d = shade(first);
    for (const m of rest.slice(0, 2)) light(m, shade(m));
    for (const m of rest.slice(2, 3 + int(r, 2))) creeper(m);
    answer = [d.id];
  } else if (q.type === 'caught') {
    // The caught one has its Creeper beside it, closer than GAP; another shade stands in the dark but
    // uncaught, so what's asked is the catch, not the dark.
    const d = shade(first);
    const x = d.x - 4 >= first.x0 + 4 ? d.x - 4 : d.x + 4;
    const u = { id: `u${foes.length + 1}`, type: 'creeper', f: first.f, x, of: first.f, ox: x, path: [], grab: d.id };
    foes.push(u);
    taken[first.f].push(x);
    d.grabbedBy = u.id;
    light(rest[0], shade(rest[0]));
    shade(rest[1]);
    if (r() < 0.6) creeper(rest[2]);
    answer = [d.id, u.id];
  } else {
    for (const m of rest.slice(0, 2)) light(m, shade(m));
    const n = 1 + int(r, 4);
    const dark = [first, ...rest.slice(2)];
    for (let i = 0; foes.length < n && i < 20; i++) creeper(dark[i % dark.length]);
    answer = foes.length;
  }
  const frame = { candles, foes, shades, broken: [], wards: [], wardHold: {}, hush: false };
  return { type: q.type, cam: q.cam, f: 1, frame, answer };
}

// Whether a shade stands in candlelight in a scene (for the tests, and a check the scene is what it says).
export function litIn(base, scene, d) {
  const G = geo(base);
  return isLit(lightMap(G, base.tuning, scene.frame.candles), d.f, d.x);
}

// A tap at (x, y) in the keep's pixels (the Tain upright): the figure nearest it, if one is within reach.
export function tappedIn(base, scene, p) {
  const G = geo(base);
  let best = null;
  for (const u of [...scene.frame.shades.map((d) => ({ ...d, shade: true })), ...scene.frame.foes]) {
    const c = centre(G, u);
    const dist = Math.hypot(c.x - p.x, c.y - p.y);
    if (dist <= REACH && (!best || dist < best.dist)) best = { id: u.id, dist };
  }
  return best?.id || null;
}
export const isRight = (scene, given) => (scene.type === 'count' ? given === scene.answer : scene.answer.includes(given));

// Where a point on the drawn still is in the keep's pixels. drawMoment crops the Tain from `top` for `h`
// rows, and the reflected camera turns the rows over.
export function stillToKeep(base, scene, sx, sy, h) {
  const G = geo(base);
  const top = G.floors[Math.max(0, scene.f - 1)].y - 2;
  return { x: sx, y: scene.cam === 'flipped' ? top + sy : top + (h - 1 - sy) };
}

// The other way, for scripted checks: where a point in the keep is on the still.
export function keepToStill(base, scene, x, y, h) {
  const G = geo(base);
  const top = G.floors[Math.max(0, scene.f - 1)].y - 2;
  return { sx: x, sy: scene.cam === 'flipped' ? y - top : h - 1 - (y - top) };
}
// Every figure in a scene, with its middle.
export function figuresOf(base, scene) {
  const G = geo(base);
  return [...scene.frame.shades.map((d) => ({ ...d, shade: true })), ...scene.frame.foes].map((u) => {
    const c = centre(G, u);
    return { id: u.id, shade: !!u.shade, cx: c.x, cy: c.y };
  });
}

const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((p, q) => p - q);
  return a.length % 2 ? a[(a.length - 1) / 2] : Math.round((a[a.length / 2 - 1] + a[a.length / 2]) / 2);
};
// Right answers and the median time per camera, and right answers per kind of question per camera.
export function quizSummary(results) {
  const byCam = {};
  for (const cam of QUIZ_CAMS) {
    const rs = results.filter((x) => x.cam === cam);
    byCam[cam] = { n: rs.length, right: rs.filter((x) => x.right).length, ms: median(rs.map((x) => x.ms)) };
  }
  const byType = {};
  for (const type of QUIZ_TYPES) {
    byType[type] = {};
    for (const cam of QUIZ_CAMS) {
      const rs = results.filter((x) => x.type === type && x.cam === cam);
      byType[type][cam] = rs.length ? { right: rs.filter((x) => x.right).length, n: rs.length, ms: median(rs.map((x) => x.ms)) } : null;
    }
  }
  return { byCam, byType };
}
