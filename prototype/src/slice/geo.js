// Geometry of a keep and its Tain: floors, rooms, candlelight, and routes through the stairs. Pure.
// A keep's layout is part of its save (s.keep: floors top to bottom, two rooms each), because the keep can
// be built up. Its geometry G is built from the layout and memoised; everything that needs it takes G.
// Floor 0 is always the top floor by day, so it is always the Tain's deepest, where the rifts open; the
// last floor stands on the Veil, where the mirrors hang. Building a floor adds a new floor 0.

import { MAP } from './data.js';

const EPS = 1e-9;
export const GNAW_GAP = 1.5; // a gnawing Creeper waits this far outside the light
export const clampX = (x) => Math.max(MAP.LEFT, Math.min(MAP.RIGHT - 1, x));
export const DEEP_FLOOR = 0;
export const PITCH = MAP.ROOM_H + 2; // a floor's rooms and the slab under them

// The original keep, four floors, each room named for its type. Seasons used to start with all of it, so
// it's the layout of a save that has none, and geoOf()'s default (the geometry tests use it).
export const FULL_KEEP = { floors: MAP.floors.map((fl) => fl.rooms.map(([id]) => ({ id, type: id }))) };
// The keep a season starts with: the lowest `floors` floors of the original. At 1 it's the ground floor
// alone, the Hearth and the Crypt, and everything else has to be built.
export function startKeep(floors) {
  const k = Math.max(1, Math.min(FULL_KEEP.floors.length, Math.round(floors) || 1));
  return { floors: FULL_KEEP.floors.slice(FULL_KEEP.floors.length - k) };
}
// The two room slots on every floor.
export const SLOTS = MAP.floors[0].rooms.map(([, a, b]) => [a, b]);

// Stairs by level, counting up from the pair that joins the Veil floor to the floor above. The first three
// are the original keep's. A built floor's stairs come up by the outer or the inner walls, clear of a
// candle in the middle of the room above (candlelight reaches 20 pixels): a stair whose top is lit can
// be gnawed from the floor below, where no shade in the light can reach the gnawer.
const STAIR_XS = [[16, 96], [40, 72], [24, 88], [8, 104], [52, 60], [10, 102], [50, 62], [8, 104], [52, 60], [10, 102]];
const STAIR_IDS = [['s5', 's6'], ['s3', 's4'], ['s1', 's2']];
export const MAX_FLOORS = MAP.floors.length + STAIR_XS.length - 3;

// Memoised by the keep object (a save's keep is never changed in place: building replaces it), then by
// layout, so the per-tick lookups cost nothing.
const byKeep = new WeakMap();
const cache = new Map();
export function geoOf(keep = FULL_KEEP) {
  let G = byKeep.get(keep);
  if (G) return G;
  const key = keep.floors.map((fl) => fl.map((r) => `${r.id}:${r.type}`).join(',')).join('|');
  G = cache.get(key);
  if (G) {
    byKeep.set(keep, G);
    return G;
  }
  const n = keep.floors.length;
  const ground = MAP.floors[MAP.floors.length - 1].y;
  const floors = keep.floors.map((fl, f) => ({
    y: ground - (n - 1 - f) * PITCH,
    rooms: fl.map((r, i) => [r.id, SLOTS[i][0], SLOTS[i][1], r.type]),
  }));
  // Top to bottom, as the original map listed them (the order breaks ties between equal routes).
  const stairs = [];
  for (let f = 0; f < n - 1; f++) {
    const level = n - 2 - f;
    const xs = STAIR_XS[level];
    const ids = STAIR_IDS[level] || [`s${2 * level + 1}`, `s${2 * level + 2}`];
    stairs.push({ id: ids[0], f, x: xs[0] }, { id: ids[1], f, x: xs[1] });
  }
  const rooms = {};
  floors.forEach((fl, f) => fl.rooms.forEach(([id, x0, x1, type]) => (rooms[id] = { id, type, f, x0, x1 })));
  G = { key, n, deep: DEEP_FLOOR, veil: n - 1, floors, stairs, rifts: MAP.rifts, mirrors: MAP.mirrors, rooms, top: floors[0].y };
  cache.set(key, G);
  byKeep.set(keep, G);
  return G;
}
export const geo = (s) => geoOf(s.keep || FULL_KEEP);

export const feet = (G, f) => G.floors[f].y + MAP.ROOM_H - 2; // the row everyone on floor f stands on

// The room at a spot (its id), or null inside a wall; its type; a room's span; every room of a type.
export function roomAt(G, f, x) {
  const r = G.floors[f]?.rooms.find(([, a, b]) => x >= a && x < b);
  return r ? r[0] : null;
}
export const typeOf = (G, id) => G.rooms[id]?.type ?? null;
export const typeAt = (G, f, x) => typeOf(G, roomAt(G, f, x));
export function roomSpan(G, id) {
  const r = G.rooms[id];
  return r ? { f: r.f, x0: r.x0, x1: r.x1 } : null;
}
export const roomsOf = (G, type) => Object.values(G.rooms).filter((r) => r.type === type);

/* ---------------------------------------------------------------- light */

export const radius = (T, c) => T.lightMin + ((T.lightMax - T.lightMin) * Math.max(0, c.wax)) / c.max;

function merge(spans) {
  const out = [];
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

// Lit spans per floor. spans keep each candle's id (for gnawing); merged is for passability.
// A candle lights only its own room, and rifts on the deepest floor drink the light around them.
export function lightMap(G, T, candles) {
  const spans = G.floors.map(() => []);
  for (const c of candles) {
    const id = roomAt(G, c.f, c.x);
    if (!id) continue;
    const { x0, x1 } = roomSpan(G, id);
    const r = radius(T, c);
    let pieces = [[Math.max(x0, c.x - r), Math.min(x1, c.x + r)]];
    if (c.f === G.deep) {
      for (const rift of G.rifts) {
        const g0 = rift.x - T.riftGap;
        const g1 = rift.x + T.riftGap;
        pieces = pieces.flatMap(([p, q]) => (q <= g0 || p >= g1 ? [[p, q]] : [[p, g0], [g1, q]].filter(([u, v]) => v - u > EPS)));
      }
    }
    for (const [p, q] of pieces) spans[c.f].push([p, q, c.id]);
  }
  return { spans, merged: spans.map(merge) };
}
export const isLit = (L, f, x) => L.merged[f].some(([a, b]) => x >= a - EPS && x <= b + EPS);
export const spanAt = (L, f, x) => L.merged[f].find(([a, b]) => x >= a - EPS && x <= b + EPS) || null;
export const darkBetween = (L, f, x1, x2) => !L.merged[f].some(([a, b]) => a <= Math.max(x1, x2) + EPS && b >= Math.min(x1, x2) - EPS);

// Rooms with no light at all, away from the Veil: where the Unlit can seep up. [f, id, x0, x1]
export function darkRooms(G, L) {
  const out = [];
  for (let f = 0; f < G.n; f++) {
    if (f === G.veil) continue;
    for (const [id, a, b] of G.floors[f].rooms) if (!L.merged[f].some(([p, q]) => p < b && q > a)) out.push([f, id, a, b]);
  }
  return out;
}

// Dark stretches at least `min` wide inside rooms, away from the Veil: [f, a, b].
export function darkGaps(G, L, min = 4) {
  const out = [];
  for (let f = 0; f < G.n; f++) {
    if (f === G.veil) continue;
    for (const [, a, b] of G.floors[f].rooms) {
      let x = a;
      for (const [p, q] of L.merged[f]) {
        if (q <= x || p >= b) continue;
        if (p - x >= min) out.push([f, x, p]);
        x = Math.max(x, q);
      }
      if (b - x >= min) out.push([f, x, b]);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- routes */

// Shortest route from `from` to the nearest of `goals` through the stairs. Creepers can't use a warded
// stair or one with light at either end, and can't walk through light unless ignoreLight is set.
// Returns { path, goal, cost } or null; steps are { f, x } to walk to or { f, x, climb } to climb to.
export function route(G, L, from, goals, { creeper = false, ignoreLight = false, wards = [] } = {}) {
  const nodes = [{ f: from.f, x: from.x }];
  for (const g of goals) nodes.push({ f: g.f, x: g.x, goal: g });
  for (const st of G.stairs) {
    if (creeper && wards.includes(st.id)) continue;
    if (creeper && !ignoreLight && (isLit(L, st.f, st.x) || isLit(L, st.f + 1, st.x))) continue;
    nodes.push({ f: st.f, x: st.x, stair: st.id, end: 0 }, { f: st.f + 1, x: st.x, stair: st.id, end: 1 });
  }
  const climbCost = creeper ? 6 : 9;
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return null;
    if (nodes[u].goal) {
      const steps = [];
      for (let v = u; prev[v] >= 0; v = prev[v]) {
        const a = nodes[prev[v]];
        const b = nodes[v];
        steps.unshift(a.stair && b.stair === a.stair && a.end !== b.end ? { f: b.f, x: b.x, climb: b.stair } : { f: b.f, x: b.x });
      }
      return { path: steps, goal: nodes[u].goal, cost: dist[u] };
    }
    done[u] = true;
    const A = nodes[u];
    for (let v = 1; v < n; v++) {
      if (done[v]) continue;
      const B = nodes[v];
      let w = Infinity;
      if (A.stair && B.stair === A.stair && A.end !== B.end) w = climbCost;
      else if (A.f === B.f && (!creeper || ignoreLight || darkBetween(L, A.f, A.x, B.x))) w = Math.abs(A.x - B.x);
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
}

// Walks a path that ignored light until it first meets light; returns the path cut short there and the
// candle to gnaw. A lit stair top is gnawed from the stair's foot.
export function firstLight(L, from, path) {
  let f = from.f;
  let x = from.x;
  const kept = [];
  for (const step of path) {
    if (step.climb) {
      const hit = L.spans[step.f].find(([a, b]) => step.x >= a - EPS && step.x <= b + EPS);
      if (hit) return { path: kept, candle: hit[2] };
      f = step.f;
      kept.push(step);
      continue;
    }
    const lo = Math.min(x, step.x);
    const hi = Math.max(x, step.x);
    const hits = L.spans[f].filter(([a, b]) => a <= hi + EPS && b >= lo - EPS);
    if (hits.length) {
      const right = step.x >= x;
      const hit = right ? hits.reduce((p, q) => (q[0] < p[0] ? q : p)) : hits.reduce((p, q) => (q[1] > p[1] ? q : p));
      const stop = right ? Math.max(x, hit[0] - GNAW_GAP) : Math.min(x, hit[1] + GNAW_GAP);
      kept.push({ f, x: clampX(stop) });
      return { path: kept, candle: hit[2] };
    }
    kept.push(step);
    x = step.x;
  }
  return null;
}

// Out of the light the shortest way, staying on the floor.
export function fleePath(L, u) {
  const span = spanAt(L, u.f, u.x);
  if (!span) return [];
  const options = [span[0] - 2, span[1] + 2].filter((x) => x >= MAP.LEFT && x <= MAP.RIGHT - 1).sort((p, q) => Math.abs(p - u.x) - Math.abs(q - u.x));
  return options.length ? [{ f: u.f, x: options[0] }] : [];
}

// Is a gnawer at the edge of this candle's light, or at the foot of a stair whose top it lights?
export function touching(G, L, u, candleId) {
  const near = GNAW_GAP + 1;
  if (L.spans[u.f].some(([a, b, id]) => id === candleId && u.x >= a - near && u.x <= b + near)) return true;
  const st = G.stairs.find((x) => Math.abs(x.x - u.x) < 1 && (x.f === u.f || x.f + 1 === u.f));
  if (!st) return false;
  const other = st.f === u.f ? st.f + 1 : st.f;
  return L.spans[other].some(([a, b, id]) => id === candleId && st.x >= a - EPS && st.x <= b + EPS);
}

export const mirrorGoals = (G) => G.mirrors.map((m) => ({ f: G.veil, x: m.x, id: m.id }));

// Guard light: the light of any candle that reaches the foot of a stair up to the Veil floor. A shade
// standing in it is guarding the line: it fights, and keeps the Watch if it's in the Watch of the Dead, but
// does no other work. Judged candle by candle, so a room on the line's floor can still be worked under a
// candle of its own, away from the stair.
export function guardLit(G, L, f, x) {
  if (f !== G.veil - 1) return false;
  const ids = new Set();
  for (const [a, b, id] of L.spans[f]) if (G.stairs.some((st) => st.f === f && st.x >= a - EPS && st.x <= b + EPS)) ids.add(id);
  return L.spans[f].some(([a, b, id]) => ids.has(id) && x >= a - EPS && x <= b + EPS);
}

// Where the line is held: the feet of the two stairs up to the Veil floor. A keep one floor high has no
// stairs, so there it's halfway between each rift and the mirror on its side.
export function lineSpots(G) {
  if (G.n > 1) return G.stairs.filter((st) => st.f === G.veil - 1).map((st) => ({ id: st.id, f: st.f, x: st.x }));
  return G.rifts.map((r, i) => ({ f: 0, x: Math.round((r.x + G.mirrors[i].x) / 2) }));
}

/* ---------------------------------------------------------------- cameras */

// The weeks 5–6 cameras, kept for the tests: views are W wide and VIEW_H tall, the original keep (or its
// Tain) plus 8 rows on the far side of the Veil. 'reflection' shows the Tain as the world has it, mirrored
// under the Veil; 'flipped' turns that over so the Tain reads upright. Each is its own inverse.
export const VIEW_H = MAP.VEIL + 8;
export const MODES = ['reflection', 'flipped'];
export const toView = (mode, x, y) => ({ x, y: mode === 'reflection' ? MAP.VEIL + 7 - y : y });
export const fromView = toView;

// The floor a row of the keep belongs to (its room, slab and the gap under it), or -1.
export function floorAtY(G, y) {
  return G.floors.findIndex((fl) => y >= fl.y - 1 && y < fl.y + MAP.ROOM_H + 1);
}
// Where a unit stands between ticks: alpha 0 is last tick, 1 is this one. Climbers slide between floors.
export function unitAt(G, u, alpha = 1) {
  let x = u.ox + (u.x - u.ox) * alpha;
  let y = feet(G, u.f);
  if (u.climb > 0 && u.climbTotal > 0 && u.path?.[0]) {
    const k = Math.max(0, Math.min(1, 1 - (u.climb - alpha) / u.climbTotal));
    y = feet(G, u.f) + (feet(G, u.path[0].f) - feet(G, u.f)) * k;
    x = u.x;
  }
  return { x, y };
}
