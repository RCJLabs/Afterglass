// Geometry of the slice's keep and its Tain: rooms, candlelight, and routes through the stairs.
// Ported from the weeks 3–4 night greybox, driven by MAP instead of fixed constants. Pure.

import { MAP, DEEP_FLOOR, VEIL_FLOOR } from './data.js';

const EPS = 1e-9;
export const GNAW_GAP = 1.5; // a gnawing Creeper waits this far outside the light
export const FLOORS = MAP.floors;
export const feet = (f) => FLOORS[f].y + MAP.ROOM_H - 2; // the row everyone on floor f stands on
export const clampX = (x) => Math.max(MAP.LEFT, Math.min(MAP.RIGHT - 1, x));

// The room at a spot, or null inside a wall.
export function roomAt(f, x) {
  const r = FLOORS[f]?.rooms.find(([, a, b]) => x >= a && x < b);
  return r ? r[0] : null;
}
export function roomSpan(id) {
  for (let f = 0; f < FLOORS.length; f++) {
    for (const [rid, a, b] of FLOORS[f].rooms) if (rid === id) return { f, x0: a, x1: b };
  }
  return null;
}
export const ROOM_IDS = FLOORS.flatMap((fl) => fl.rooms.map((r) => r[0]));
export const ROOMS_ON = (f) => FLOORS[f].rooms.map((r) => r[0]);

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
export function lightMap(T, candles) {
  const spans = FLOORS.map(() => []);
  for (const c of candles) {
    const id = roomAt(c.f, c.x);
    if (!id) continue;
    const { x0, x1 } = roomSpan(id);
    const r = radius(T, c);
    let pieces = [[Math.max(x0, c.x - r), Math.min(x1, c.x + r)]];
    if (c.f === DEEP_FLOOR) {
      for (const rift of MAP.rifts) {
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

// Rooms with no light at all, away from the Veil: where the Unlit can seep up.
export function darkRooms(L) {
  const out = [];
  for (let f = 0; f < FLOORS.length; f++) {
    if (f === VEIL_FLOOR) continue;
    for (const [id, a, b] of FLOORS[f].rooms) if (!L.merged[f].some(([p, q]) => p < b && q > a)) out.push([f, id, a, b]);
  }
  return out;
}

// Dark stretches at least `min` wide inside rooms, away from the Veil: [f, a, b].
export function darkGaps(L, min = 4) {
  const out = [];
  for (let f = 0; f < FLOORS.length; f++) {
    if (f === VEIL_FLOOR) continue;
    for (const [, a, b] of FLOORS[f].rooms) {
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
export function route(L, from, goals, { creeper = false, ignoreLight = false, wards = [] } = {}) {
  const nodes = [{ f: from.f, x: from.x }];
  for (const g of goals) nodes.push({ f: g.f, x: g.x, goal: g });
  for (const st of MAP.stairs) {
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
export function touching(L, u, candleId) {
  const near = GNAW_GAP + 1;
  if (L.spans[u.f].some(([a, b, id]) => id === candleId && u.x >= a - near && u.x <= b + near)) return true;
  const st = MAP.stairs.find((x) => Math.abs(x.x - u.x) < 1 && (x.f === u.f || x.f + 1 === u.f));
  if (!st) return false;
  const other = st.f === u.f ? st.f + 1 : st.f;
  return L.spans[other].some(([a, b, id]) => id === candleId && st.x >= a - EPS && st.x <= b + EPS);
}

export const mirrorGoals = () => MAP.mirrors.map((m) => ({ f: VEIL_FLOOR, x: m.x, id: m.id }));
