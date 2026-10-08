// The weeks 3–4 greybox: the night on its own. Pure and deterministic like sim.js: one JSON state,
// stepNight() is one fixed tick, actNight() one player action, replayNight() rebuilds a session.
//
// Space is a side view of the Tain: floors stacked top (under the Veil) to bottom (over the Deep),
// each a line of rooms W tiles wide, joined by stairs. A candle lights a span of its own room.
// Creepers climb from rifts in the Deep toward the mirrors in the Veil. They can't enter light:
// they gnaw at its edge, and they catch shades left in the dark.

import { TICKS_PER_SEC, NAMES } from './data.js';
import {
  NIGHT_TUNING, W, FLOORS, BOTTOM, STAIRS, RIFTS, VEIL_MIRRORS, WORK_ROOM, REST_ROOM, NIGHT_KINDS, ARRIVAL_KINDS,
  START_SHADES,
} from './night-data.js';
import { rand, pick, chance, pickWeighted } from './rng.js';

export const NIGHT_SAVE = 1;
const DT = 1 / TICKS_PER_SEC;
const EPS = 1e-9;
const GNAW_GAP = 0.35; // a gnawing Creeper waits this far outside the light
const round2 = (x) => Math.round(x * 100) / 100;

export const nightTicks = (s) => Math.round(s.tuning.nightSecs * TICKS_PER_SEC);
export const byId = (list, id) => list.find((x) => x.id === id);
export const roomAt = (f, x) => FLOORS[f].find(([, , a, b]) => x >= a && x < b) || FLOORS[f][FLOORS[f].length - 1];
export const roomName = (f, x) => roomAt(f, x)[1];
export const perf = (d) => 0.4 + (0.6 * Math.max(0, d.memory)) / 100;

/* ---------------------------------------------------------------- setup */

export function newNightGame(seed = Date.now() >>> 0, overrides = {}) {
  const tuning = { ...NIGHT_TUNING, ...overrides };
  const s = {
    v: NIGHT_SAVE,
    mode: 'night',
    seed: seed >>> 0,
    rng: seed >>> 0,
    tuning,
    tuning0: JSON.parse(JSON.stringify(tuning)),
    night: 1,
    phase: 'dusk', // dusk (paused: place candles and shades) → night → dawn (paused) → dusk …, or 'over'
    t: 0,
    rev: 0,
    candlesLeft: tuning.candles,
    essence: 0,
    remembrance: 0,
    cracks: 0,
    hush: false,
    shades: [],
    candles: [],
    creepers: [],
    wards: [],
    spawns: [],
    nextId: 1,
    used: [],
    tonight: blankNight(),
    nights: [],
    over: null,
    log: [],
    alerts: [],
    actions: [],
  };
  START_SHADES.forEach(([name, kind], i) => addShade(s, name, kind, 2 + i * 2.5));
  planNight(s);
  say(s, 'Dusk on night 1. Place candles and post the shades, then begin the night.', 'dusk');
  return s;
}

function blankNight() {
  return { spawned: 0, killed: 0, crossed: 0, grabbed: 0, drained: 0, essence: 0, candles: 0, wards: 0, lost: [], actions: 0 };
}

function addShade(s, name, kind, x) {
  s.used.push(name);
  const d = {
    id: 'n' + s.nextId++, name, kind, memory: 100, named: false, f: 0, x, ox: x, of: 0, post: { f: 0, x }, path: [],
    climb: 0, climbTotal: 0, grabbedBy: null, rest: 0, drained: 0, worked: 0, nights: 0,
  };
  s.shades.push(d);
  return d;
}

function say(s, text, tone = '', alert = false) {
  s.log.push({ night: s.night, phase: s.phase, t: s.t, text, tone });
  if (s.log.length > 600) s.log.splice(0, s.log.length - 600);
  if (alert) s.alerts.push({ text, tone });
  s.rev++;
}

// Tonight's Creepers: more each night, thicker toward dawn. From seepFrom on, some rise in dark rooms.
function planNight(s) {
  const T = s.tuning;
  const N = nightTicks(s);
  const count = T.creepersBase + T.creepersPerNight * s.night;
  s.spawns = [];
  for (let i = 0; i < count; i++) {
    const at = Math.round((0.05 + 0.8 * Math.pow(rand(s), 0.75)) * N);
    s.spawns.push({ at, seep: s.night >= T.seepFrom && chance(s, T.seepShare), snuff: chance(s, T.snuffShare), rift: pick(s, RIFTS).id });
  }
  s.spawns.sort((a, b) => a.at - b.at);
}

/* ---------------------------------------------------------------- light */

export const radius = (s, c) => s.tuning.lightMin + ((s.tuning.lightMax - s.tuning.lightMin) * Math.max(0, c.wax)) / c.max;

function merge(spans) {
  const out = [];
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

// Lit spans per floor: `spans` keeps which candle lights what (for gnawing), `merged` is for passability.
export function lightMap(s) {
  const spans = FLOORS.map(() => []);
  for (const c of s.candles) {
    const [, , a, b] = roomAt(c.f, c.x);
    const r = radius(s, c);
    let pieces = [[Math.max(a, c.x - r), Math.min(b, c.x + r)]];
    if (c.f === BOTTOM) {
      // Rifts drink light: nothing near a rift is ever lit.
      for (const rift of RIFTS) {
        const g0 = rift.x - s.tuning.riftGap;
        const g1 = rift.x + s.tuning.riftGap;
        pieces = pieces.flatMap(([p, q]) => (q <= g0 || p >= g1 ? [[p, q]] : [[p, g0], [g1, q]].filter(([u, v]) => v - u > EPS)));
      }
    }
    for (const [p, q] of pieces) spans[c.f].push([p, q, c.id]);
  }
  return { spans, merged: spans.map(merge) };
}

export const isLit = (L, f, x) => L.merged[f].some(([a, b]) => x >= a - EPS && x <= b + EPS);
const spanAt = (L, f, x) => L.merged[f].find(([a, b]) => x >= a - EPS && x <= b + EPS) || null;
const darkBetween = (L, f, x1, x2) => !L.merged[f].some(([a, b]) => a <= Math.max(x1, x2) + EPS && b >= Math.min(x1, x2) - EPS);

function darkRooms(L) {
  const out = [];
  for (let f = 1; f < FLOORS.length; f++) {
    for (const room of FLOORS[f]) if (!L.merged[f].some(([a, b]) => a < room[3] && b > room[2])) out.push([f, room]);
  }
  return out;
}

/* ---------------------------------------------------------------- routes */

// Shortest route from `from` to the nearest of `goals`, through the stairs. Creepers can't use a warded
// stair or one with light at either end, and can't walk through light unless ignoreLight is set.
// Returns { path, goal, cost } or null. A path is a list of steps: { f, x } to walk to, or
// { f, x, climb: stairId } to climb a stair to that floor.
export function route(s, L, from, goals, { creeper = false, ignoreLight = false } = {}) {
  const nodes = [{ f: from.f, x: from.x }];
  for (const g of goals) nodes.push({ f: g.f, x: g.x, goal: g });
  for (const st of STAIRS) {
    if (creeper && s.wards.includes(st.id)) continue;
    if (creeper && !ignoreLight && (isLit(L, st.f, st.x) || isLit(L, st.f + 1, st.x))) continue;
    nodes.push({ f: st.f, x: st.x, stair: st.id, end: 0 }, { f: st.f + 1, x: st.x, stair: st.id, end: 1 });
  }
  const climbCost = creeper ? 1.5 : 2.2;
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

const mirrorGoals = () => VEIL_MIRRORS.map((m) => ({ f: 0, x: m.x, id: m.id }));

// Walks an unlit-blind path until it first meets light; returns the path cut short there and the
// candle to gnaw. A lit stair top is gnawed from the stair's foot.
function firstLight(L, from, path) {
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
      kept.push({ f, x: Math.max(0, Math.min(W, stop)) });
      return { path: kept, candle: hit[2] };
    }
    kept.push(step);
    x = step.x;
  }
  return null;
}

/* ---------------------------------------------------------------- movement */

function advance(u, speed, climbTicks) {
  u.ox = u.x;
  u.of = u.f;
  if (u.climb > 0) {
    if (--u.climb === 0) {
      const step = u.path.shift();
      u.f = step.f;
      u.x = step.x;
      u.of = u.f;
      u.ox = u.x;
    }
    return;
  }
  let budget = speed * DT;
  while (u.path.length && budget > EPS) {
    const step = u.path[0];
    if (step.climb) {
      u.climb = climbTicks;
      u.climbTotal = climbTicks;
      return;
    }
    const dx = step.x - u.x;
    if (Math.abs(dx) <= budget) {
      u.x = step.x;
      budget -= Math.abs(dx);
      u.path.shift();
    } else {
      u.x += Math.sign(dx) * budget;
      budget = 0;
    }
  }
}

/* ---------------------------------------------------------------- the clock */

export function stepNight(s) {
  if (s.phase !== 'night') return;
  s.t++;
  const L = lightMap(s);
  spawn(s, L);
  for (const c of s.candles) c.wax -= DT;
  for (const d of [...s.shades]) shadeTick(s, L, d);
  for (const c of [...s.creepers]) creeperTick(s, L, c);
  if (s.phase !== 'night') return;
  for (const c of s.creepers) {
    if (c.hp > 0) continue;
    s.tonight.killed++;
    const d = c.grab && byId(s.shades, c.grab);
    if (d && d.grabbedBy === c.id) d.grabbedBy = null;
  }
  s.creepers = s.creepers.filter((c) => c.hp > 0);
  for (const c of s.candles.filter((x) => x.wax <= 0)) say(s, `A candle in the ${roomName(c.f, c.x)} has burned out.`);
  s.candles = s.candles.filter((c) => c.wax > 0);
  if (s.t >= nightTicks(s)) dawn(s);
}

function spawn(s, L) {
  while (s.spawns.length && s.spawns[0].at <= s.t) {
    const sp = s.spawns.shift();
    let at = null;
    // A warded rift turns its Creepers away to another rift; with every rift sealed they seep up instead.
    const open = RIFTS.filter((r) => !s.wards.includes(r.id));
    if (sp.seep || !open.length) {
      const dark = darkRooms(L);
      if (dark.length) {
        const [f, room] = pick(s, dark);
        at = { f, x: room[2] + (room[3] - room[2]) * (0.25 + 0.5 * rand(s)) };
        say(s, `The Unlit seep up in the ${room[1]}. It has no candle.`, 'bad', s.creepers.length < 3);
      }
    }
    if (!at && !open.length) continue; // sealed rifts and no dark room left: the Unlit find no way in
    if (!at) at = { f: BOTTOM, x: (open.find((r) => r.id === sp.rift) || open[s.t % open.length]).x };
    addCreeper(s, at.f, at.x, sp.snuff ? 'snuff' : 'climb');
    s.tonight.spawned++;
  }
}

export function addCreeper(s, f, x, temper = 'climb') {
  const c = {
    id: 'c' + s.nextId++, f, x, ox: x, of: f, hp: s.tuning.creeperHp, path: [], climb: 0, climbTotal: 0, temper,
    mode: 'climb', prey: null, gnaw: null, gnawing: false, grab: null, replan: 0,
  };
  s.creepers.push(c);
  return c;
}

function shadeTick(s, L, d) {
  const T = s.tuning;
  const K = NIGHT_KINDS[d.kind];
  if (d.grabbedBy) {
    const c = byId(s.creepers, d.grabbedBy);
    if (!c || c.grab !== d.id || s.hush) {
      d.grabbedBy = null;
      if (c && c.grab === d.id) c.grab = null;
    } else {
      const loss = T.drainPerSec * DT;
      d.memory -= loss;
      d.drained += loss;
      s.tonight.drained += loss;
      if (d.memory <= 0) {
        c.grab = null;
        fadeAway(s, d, `${d.name} was drained to nothing in the ${roomName(d.f, d.x)} and is gone.`);
      }
      return;
    }
  }
  advance(d, T.shadeSpeed * K.speed, Math.round(T.shadeClimb * TICKS_PER_SEC));
  if (d.climb || s.hush) return;
  const p = perf(d);
  // Hold: a shade standing in light defends that light. It steps to whichever edge is under attack,
  // never past it, and goes back to its post when the edge is quiet.
  const span = !d.path.length && spanAt(L, d.f, d.x);
  if (span) {
    const threat = s.creepers
      .filter((c) => c.f === d.f && !c.climb && c.hp > 0 && c.x >= span[0] - 1.2 && c.x <= span[1] + 1.2)
      .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
    const home = d.post && d.post.f === d.f && d.post.x >= span[0] && d.post.x <= span[1] ? d.post.x : d.x;
    const goal = threat ? Math.max(span[0] + 0.2, Math.min(span[1] - 0.2, threat.x)) : home;
    const step = T.shadeSpeed * K.speed * DT;
    d.x = Math.abs(goal - d.x) <= step ? goal : d.x + Math.sign(goal - d.x) * step;
  }
  const foe = s.creepers
    .filter((c) => c.f === d.f && !c.climb && c.hp > 0 && Math.abs(c.x - d.x) <= T.reach)
    .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
  if (foe) {
    foe.hp -= T.fightDps * K.fight * p * DT;
    return;
  }
  if (d.path.length || !isLit(L, d.f, d.x) || (d.post && Math.abs(d.post.x - d.x) > 0.3)) return;
  const room = roomAt(d.f, d.x)[0];
  if (room === WORK_ROOM) {
    const e = T.essencePerSec * K.work * p * DT;
    s.essence += e;
    d.worked += e;
    s.tonight.essence += e;
  } else if (room === REST_ROOM) {
    d.rest++;
  }
}

function creeperTick(s, L, c) {
  const T = s.tuning;
  if (c.hp <= 0 || s.phase !== 'night') return;
  c.gnawing = false;
  const lit = !c.climb && isLit(L, c.f, c.x);
  if (c.grab) {
    const d = byId(s.shades, c.grab);
    if (!d || d.grabbedBy !== c.id || s.hush || lit) {
      if (d && d.grabbedBy === c.id) d.grabbedBy = null;
      c.grab = null;
      c.replan = 0;
    } else {
      return;
    }
  }
  if (lit) {
    c.hp -= T.burnDps * DT;
    if (c.mode !== 'flee') {
      c.mode = 'flee';
      c.path = fleePath(L, c);
      c.replan = 10;
    }
  }
  if (--c.replan <= 0 && !c.climb) plan(s, L, c);
  advance(c, T.creeperSpeed, Math.round(T.creeperClimb * TICKS_PER_SEC));
  if (c.climb) return;
  if (c.f === 0) {
    const m = VEIL_MIRRORS.find((x) => Math.abs(x.x - c.x) < 0.5);
    if (m) {
      cross(s, c, m);
      return;
    }
  }
  if (c.mode === 'hunt' && !s.hush) {
    const d = byId(s.shades, c.prey);
    if (d && !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - c.x) < 0.6 && !isLit(L, d.f, d.x)) {
      c.grab = d.id;
      c.path = [];
      d.grabbedBy = c.id;
      d.path = [];
      s.tonight.grabbed++;
      say(s, `A Creeper has caught ${d.name} in the dark of the ${roomName(d.f, d.x)}.`, 'bad', true);
    }
  }
  if (c.mode === 'gnaw' && !c.path.length) {
    const candle = byId(s.candles, c.gnaw);
    if (candle && touching(L, c, candle.id)) {
      candle.wax -= T.gnawRate * DT;
      c.gnawing = true;
    } else {
      c.replan = 0;
    }
  }
}

// Is the Creeper at the edge of this candle's light, or at the foot of a stair whose top it lights?
function touching(L, c, candleId) {
  const near = GNAW_GAP + 0.25;
  if (L.spans[c.f].some(([a, b, id]) => id === candleId && c.x >= a - near && c.x <= b + near)) return true;
  const st = STAIRS.find((x) => Math.abs(x.x - c.x) < 0.3 && (x.f === c.f || x.f + 1 === c.f));
  if (!st) return false;
  const other = st.f === c.f ? st.f + 1 : st.f;
  return L.spans[other].some(([a, b, id]) => id === candleId && st.x >= a - EPS && st.x <= b + EPS);
}

function plan(s, L, c) {
  const T = s.tuning;
  c.replan = 5;
  if (isLit(L, c.f, c.x)) {
    c.mode = 'flee';
    c.path = fleePath(L, c);
    return;
  }
  if (!s.hush) {
    const prey = s.shades
      .filter((d) => !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - c.x) <= T.senseRange && !isLit(L, d.f, d.x) && darkBetween(L, c.f, c.x, d.x))
      .sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
    if (prey) {
      c.mode = 'hunt';
      c.prey = prey.id;
      c.path = [{ f: c.f, x: prey.x }];
      return;
    }
  }
  // Snuffers go for the nearest light they can reach through the dark.
  if (c.temper === 'snuff') {
    const edges = [];
    for (let f = 0; f < FLOORS.length; f++) {
      for (const [a, b, id] of L.spans[f]) {
        for (const x of [a - GNAW_GAP, b + GNAW_GAP]) if (x >= 0 && x <= W && !isLit(L, f, x)) edges.push({ f, x, candle: id });
      }
    }
    const to = edges.length && route(s, L, c, edges, { creeper: true });
    if (to) {
      c.mode = 'gnaw';
      c.gnaw = to.goal.candle;
      c.path = to.path;
      return;
    }
  }
  const r = route(s, L, c, mirrorGoals(), { creeper: true });
  if (r) {
    c.mode = 'climb';
    c.gnaw = null;
    c.path = r.path;
    return;
  }
  const open = route(s, L, c, mirrorGoals(), { creeper: true, ignoreLight: true });
  const cut = open && firstLight(L, c, open.path);
  if (!cut) {
    c.mode = 'idle';
    c.path = [];
    return;
  }
  c.mode = 'gnaw';
  c.gnaw = cut.candle;
  c.path = cut.path;
}

function fleePath(L, c) {
  const span = L.merged[c.f].find(([a, b]) => c.x >= a - EPS && c.x <= b + EPS);
  if (!span) return [];
  const left = span[0] - 0.4;
  const right = span[1] + 0.4;
  const options = [left, right].filter((x) => x >= 0 && x <= W).sort((p, q) => Math.abs(p - c.x) - Math.abs(q - c.x));
  return options.length ? [{ f: c.f, x: options[0] }] : [];
}

function cross(s, c, m) {
  s.creepers = s.creepers.filter((x) => x !== c);
  s.cracks++;
  s.tonight.crossed++;
  say(s, `A Creeper slipped through the Veil at the ${roomName(0, m.x)} mirror. The Veil cracks: ${s.cracks} of ${s.tuning.cracksMax}.`, 'bad', true);
  if (s.cracks >= s.tuning.cracksMax) end(s, 'veil', 'The Veil has broken. The Unlit are loose in the keep above.');
}

function fadeAway(s, d, text) {
  s.shades = s.shades.filter((x) => x !== d);
  for (const c of s.creepers) {
    if (c.grab === d.id) c.grab = null;
    if (c.prey === d.id) c.prey = null;
  }
  s.tonight.lost.push(d.name);
  say(s, text, 'death', true);
}

function end(s, reason, text) {
  s.phase = 'over';
  s.over = { reason, night: s.night };
  const last = s.nights[s.nights.length - 1];
  if (last && last.night === s.night) last.over = reason;
  else s.nights.push({ night: s.night, ...s.tonight, fading: [], rating: null, over: reason });
  say(s, text, 'bad', true);
}

/* ---------------------------------------------------------------- dawn */

function dawn(s) {
  const T = s.tuning;
  const withdrew = s.creepers.length;
  s.phase = 'dawn';
  s.t = 0;
  s.creepers = [];
  s.candles = [];
  s.hush = false;
  const fading = [];
  for (const d of [...s.shades]) {
    const rested = d.rest >= T.restShare * nightTicks(s);
    const loss = T.fadePerNight * (d.named ? 0.5 : 1) * (rested ? 0.5 : 1);
    d.memory = round2(d.memory - loss);
    d.nights++;
    fading.push({ id: d.id, name: d.name, fade: loss, drained: round2(d.drained), rested, memory: d.memory });
    d.path = [];
    d.climb = 0;
    d.grabbedBy = null;
    d.post = { f: d.f, x: d.x };
    d.rest = 0;
    d.drained = 0;
    if (d.memory <= 0) fadeAway(s, d, `${d.name} has faded. Nothing is left in the glass.`);
  }
  s.nights.push({ night: s.night, ...s.tonight, fading, rating: null });
  s.remembrance += T.remembrancePerDawn;
  if (s.cracks > 0) s.cracks--;
  const n = pickWeighted(s, [0, 1, 2], (k) => T.arrivals[k]);
  const room = Math.max(0, T.capacity - s.shades.length);
  const arrived = [];
  for (let i = 0; i < Math.min(n, room); i++) {
    const kind = pickWeighted(s, ARRIVAL_KINDS, ([, w]) => w)[0];
    const free = NAMES.filter((x) => !s.used.includes(x));
    const d = addShade(s, free.length ? pick(s, free) : `Shade ${s.nextId}`, kind, 2 + (s.shades.length % 5) * 2);
    arrived.push(`${d.name} (${NIGHT_KINDS[kind].name})`);
  }
  say(s, `Dawn. ${withdrew ? `${withdrew} Creeper${withdrew === 1 ? '' : 's'} withdrew. ` : ''}The candles are out, and every shade loses a little of itself.${arrived.length ? ` New dead from the day: ${arrived.join(', ')}.` : ''}`, 'rite', true);
  if (!s.shades.length) end(s, 'empty', 'The glass is empty. No shade is left to hold the night.');
}

/* ---------------------------------------------------------------- player actions */

const onFloor = (f, x) => Number.isInteger(f) && f >= 0 && f < FLOORS.length && Number.isFinite(x) && x >= 0 && x <= W;

const ACTIONS = {
  candle(s, { f, x }) {
    if (s.phase !== 'dusk' && s.phase !== 'night') return 'Candles are placed at dusk or during the night.';
    if (!onFloor(f, x)) return 'That is not a place in the Tain.';
    if (s.candlesLeft < 1) return 'No candles left tonight.';
    s.candlesLeft--;
    s.candles.push({ id: 'k' + s.nextId++, f, x, wax: s.tuning.candleWax, max: s.tuning.candleWax });
    s.tonight.candles++;
  },
  move(s, { id, f, x }) {
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!onFloor(f, x)) return 'That is not a place in the Tain.';
    if (s.phase === 'dusk') {
      Object.assign(d, { f, x, ox: x, of: f, post: { f, x }, path: [], climb: 0 });
      return undefined;
    }
    if (s.phase !== 'night') return 'Shades move at dusk and during the night.';
    if (d.grabbedBy) return `${d.name} is held by a Creeper. Light the spot to free it.`;
    if (d.climb) return `${d.name} is on the stairs.`;
    const r = route(s, lightMap(s), d, [{ f, x }]);
    if (!r) return 'No way there.';
    d.path = r.path;
    d.post = { f, x };
  },
  ward(s, { target }) {
    if (s.phase !== 'dusk' && s.phase !== 'night') return 'Wards are set at dusk or during the night.';
    if (!STAIRS.some((x) => x.id === target) && !RIFTS.some((x) => x.id === target)) return 'Wards seal a stair or a rift.';
    if (s.wards.includes(target)) return 'Already warded tonight.';
    if (s.essence + EPS < s.tuning.wardCost) return `A ward costs ${s.tuning.wardCost} essence.`;
    s.essence = Math.max(0, s.essence - s.tuning.wardCost);
    s.wards.push(target);
    s.tonight.wards++;
    for (const c of s.creepers) c.replan = 0;
  },
  hush(s, { on }) {
    if (s.phase !== 'night') return 'Hush is for the night.';
    s.hush = !!on;
    say(s, on ? 'Hush. The shades go silent; the Unlit pass them by, and all work stops.' : 'The hush ends.', on ? 'night' : '');
  },
  start(s) {
    if (s.phase !== 'dusk') return 'The night begins after dusk.';
    s.phase = 'night';
    s.t = 0;
    say(s, `Night ${s.night}. ${s.spawns.length} Creepers will come before dawn.`, 'night');
  },
  name(s, { id }) {
    const d = byId(s.shades, id);
    if (s.phase !== 'dawn') return 'The dead are named at dawn.';
    if (!d) return 'No such shade.';
    if (d.named) return `${d.name} is already in the ledger.`;
    if (s.remembrance + EPS < s.tuning.nameCost) return `Naming costs ${s.tuning.nameCost} remembrance.`;
    s.remembrance -= s.tuning.nameCost;
    d.named = true;
    say(s, `${d.name} is written in the ledger and will fade half as fast.`, 'good');
  },
  remember(s, { id }) {
    const d = byId(s.shades, id);
    if (s.phase !== 'dawn') return 'Remembrance is spent at dawn.';
    if (!d) return 'No such shade.';
    if (d.memory >= 100) return `${d.name} remembers everything.`;
    if (s.remembrance + EPS < s.tuning.rememberCost) return `Remembering costs ${s.tuning.rememberCost} remembrance.`;
    s.remembrance -= s.tuning.rememberCost;
    d.memory = Math.min(100, d.memory + s.tuning.rememberGain);
  },
  release(s, { id }) {
    const d = byId(s.shades, id);
    if (s.phase !== 'dawn') return 'Shades are released at dawn.';
    if (!d) return 'No such shade.';
    s.shades = s.shades.filter((x) => x !== d);
    s.remembrance += s.tuning.releaseGain;
    say(s, `${d.name}'s mirror is covered. Released, with ${s.tuning.releaseGain} remembrance.`, 'rest');
  },
  rate(s, { score, night }) {
    const n = night === undefined ? s.nights[s.nights.length - 1] : s.nights.find((x) => x.night === night);
    if (!n) return 'No night to rate yet.';
    if (score !== null && !(Number.isInteger(score) && score >= 1 && score <= 5)) return 'Rate from 1 to 5.';
    n.rating = score;
  },
  next(s) {
    if (s.phase !== 'dawn') return 'The next dusk follows dawn.';
    s.night++;
    s.phase = 'dusk';
    s.t = 0;
    s.candlesLeft = s.tuning.candles;
    s.wards = [];
    s.tonight = blankNight();
    planNight(s);
    say(s, `Dusk on night ${s.night}. ${s.tuning.candles} candles, ${s.shades.length} shades.`, 'dusk');
  },
  tune(s, { key, value }) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return 'Needs a number.';
    if (typeof s.tuning[key] !== 'number') return 'No such setting.';
    if (key === 'nightSecs' && v < 10) return 'At least 10 seconds.';
    s.tuning[key] = v;
    // At dusk, tonight's Creepers are re-planned so the change applies to the coming night.
    if (s.phase === 'dusk' && ['nightSecs', 'creepersBase', 'creepersPerNight', 'seepFrom', 'seepShare', 'snuffShare'].includes(key)) planNight(s);
  },
  debug(s, { what, n }) {
    if (what === 'candles') s.candlesLeft += Number(n) || 0;
    else if (what === 'essence') s.essence += Number(n) || 0;
    else if (what === 'remembrance') s.remembrance += Number(n) || 0;
    else if (what === 'dawn' && s.phase === 'night') s.t = nightTicks(s) - 1;
    else return 'Unknown debug action.';
  },
};

export function actNight(s, a) {
  if (s.phase === 'over' && a.type !== 'rate') return { ok: false, error: 'This keep is lost. Start a new one.' };
  const f = ACTIONS[a.type];
  if (!f) return { ok: false, error: `Unknown action: ${a.type}` };
  const at = { night: s.night, phase: s.phase, t: s.t };
  const error = f(s, a);
  if (error) return { ok: false, error };
  s.actions.push({ a, at });
  if (s.phase === 'night' || s.phase === 'dusk') s.tonight.actions++;
  s.rev++;
  return { ok: true };
}

export function replayNight(seed, tuning, actions) {
  const s = newNightGame(seed, tuning);
  for (const { a, at } of actions) {
    let guard = 1e7;
    while (!(s.night === at.night && s.phase === at.phase && s.t === at.t)) {
      if (s.phase !== 'night') throw new Error(`Replay stuck: night ${s.night} ${s.phase}, waiting for night ${at.night} ${at.phase} t${at.t}`);
      if (!guard--) throw new Error('Replay ran away');
      stepNight(s);
    }
    const r = actNight(s, a);
    if (!r.ok) throw new Error(`Replay action ${a.type} failed: ${r.error}`);
  }
  return s;
}
