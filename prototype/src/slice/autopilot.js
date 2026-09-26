// A scripted player for the season slice, for soak tests and balance runs. It plays through act() only,
// so everything it does is replayable. Plans differ in how they treat the dead:
//   keeper   keeps every shade it can, funerals only for the dead that would wake wrong
//   mourner  holds every funeral it can and covers shades whenever Dread climbs
//   balanced keeps shades while Dread allows, and aims low before an inspection
//   double   the balanced plan, but from the first Maw night it posts two fighters on each stair of the
//            line and never moves anyone: the static answer the Maws are meant to break
//   idle     works the day but leaves the night alone: no candles, no posts (a baseline)
// All but double and idle react at night: a second fighter to each stair of the line for each tide, a ward
// on the line for the biggest tides when the essence is there, and a fighter to meet a Maw.

import { step, act, newSeason, ritePreview, crossingPreview, capacity, canWork, defense, funeralCap, choicesFor, jobCap, jobCount, eatRate, wardCost, livingTrait, shadeTrait } from './sim.js';
import { DAY_ROOMS, MIRRORS, KINDS, MAP } from './data.js';
import { geo, roomSpan, roomAt, roomsOf, lineSpots } from './geo.js';

export const PLANS = ['balanced', 'keeper', 'mourner', 'double', 'idle'];

const doAct = (s, a) => act(s, a).ok;
// Traits, as a player reads them. AP_BLIND=1 plays as if nobody had one (to measure what they're worth).
const BLIND = !!globalThis.process?.env?.AP_BLIND;
// AP_BELOW=1 also works the rooms below the line on the Choir's side of the keep, leaving the other side dark
// as the Unlit's way up (to measure whether working below the line pays).
const BELOW = !!globalThis.process?.env?.AP_BELOW;
// AP_BREAK=1 breaks a mirror to stop a censure (to measure whether that pays).
const BREAK = globalThis.process?.env?.AP_BREAK;
const LT = (s, p) => (BLIND ? null : livingTrait(s, p));
const ST = (s, d) => (BLIND ? null : shadeTrait(s, d));
// How well someone does a job, by their trait.
const fit = (s, p, k) => {
  const L = LT(s, p);
  return L ? (L.any ?? 1) * (L.jobs?.[k] ?? 1) * (k === 'barracks' ? (L.guard ?? 1) : 1) : 1;
};

/* ---------------------------------------------------------------- day */

// What it builds, in order, counting what's already standing: a Barracks for the day-2 raid, a Chapel (its
// priests bear Dread and hold funerals), a Chandlery before the first candles run out, a Glazier for mirrors,
// an Infirmary, a second Barracks (one holds only three guards), a Forge for grave-steel, a Granary and a
// Cellar. A crude player: nothing past that.
const BUILD_ORDER = ['barracks', 'chapel', 'chandlery', 'glazier', 'infirmary', 'barracks', 'forge', 'granary', 'cellar'];
function nextBuild(s) {
  const want = {};
  for (const type of BUILD_ORDER) {
    want[type] = (want[type] || 0) + 1;
    if (roomsOf(geo(s), type).length < want[type]) return type;
  }
  return null;
}

function wantedJobs(s) {
  const n = s.living.length;
  const r = s.raid;
  const threat = r && r.state === 'coming' && r.warned && defense(s) < r.strength;
  const food = eatRate(s) + (s.res.food < n ? 2 : 0) - (s.res.food > 3 * n ? 3 : 0);
  const want = {
    hearth: Math.max(1, Math.ceil(food / DAY_ROOMS.hearth.rate)),
    chapel: n >= 10 ? 2 : 1,
    infirmary: s.living.some((p) => p.sick > 0) ? 1 : 0,
    chandlery: threat ? 0 : s.res.candles < 8 ? 2 : 1,
    glazier: threat || n < 6 ? 0 : 1,
    yard: !threat && nextBuild(s) && s.res.stone < s.tuning.roomStone ? 1 : 0,
  };
  // Nobody can work a room that isn't built.
  for (const k of Object.keys(want)) want[k] = Math.min(want[k], jobCap(s, k));
  return want;
}

function staff(s) {
  const want = wantedJobs(s);
  const order = ['hearth', 'chapel', 'infirmary', 'chandlery', 'glazier', 'yard'];
  const count = Object.fromEntries(order.map((k) => [k, 0]));
  const free = [];
  for (const p of s.living) {
    if (p.job in count && count[p.job] < want[p.job]) count[p.job]++;
    else free.push(p);
  }
  // Keep the old at the Chapel and the sick out of the barracks where there's a choice.
  free.sort((a, b) => (a.age === 'old') - (b.age === 'old'));
  for (const k of order) {
    while (count[k] < want[k] && free.length) {
      // The usual pick, unless someone else's trait suits the job better.
      let i = k === 'chapel' ? free.length - 1 : 0;
      for (const [j, q] of free.entries()) if (fit(s, q, k) > fit(s, free[i], k) + 1e-9) i = j;
      const [p] = free.splice(i, 1);
      if (p.job !== k) doAct(s, { type: 'assign', id: p.id, room: k });
      count[k]++;
    }
  }
  free.sort((a, b) => fit(s, b, 'barracks') - fit(s, a, 'barracks')); // the Brave to the gate first, Cowards last
  // The rest hold the gate on a raid day, or when there's nothing to build, as many as the barracks hold;
  // everyone else quarries stone.
  const gate = !!s.raid || !nextBuild(s);
  for (const p of free) {
    const room = gate && (p.job === 'barracks' || jobCount(s, 'barracks') < jobCap(s, 'barracks')) ? 'barracks' : 'yard';
    if (p.job !== room) doAct(s, { type: 'assign', id: p.id, room });
  }
}

function dayMoves(s) {
  const b = nextBuild(s);
  if (b && s.res.stone >= s.tuning.roomStone) doAct(s, { type: 'raise', room: b });
  staff(s);
  const r = s.raid;
  if (r && r.state === 'coming' && r.warned && !r.ward && defense(s) < r.strength) doAct(s, { type: 'wardGate' });
  const { free } = capacity(s);
  if (free <= 0 || (free <= 1 && s.bodies.length)) {
    const kind = s.res.glass >= MIRRORS.pier.glass ? 'pier' : s.res.glass >= MIRRORS.hand.glass ? 'hand' : null;
    if (kind) doAct(s, { type: 'build', mirror: kind });
  }
  const I = s.inspection;
  if (I && !I.done && I.day === s.day) while (s.dread >= 2 && doAct(s, { type: 'vigil' }));
  // A censure coming at noon that vigils can't stop: break the mirror that brings Dread under it for the
  // fewest shades, rather than let the Church carry off the fullest.
  if (BREAK && I && !I.done && I.day === s.day && s.dread >= 4) {
    const need = Math.ceil((s.dread - 3) / s.tuning.breakDread);
    const all = s.mirrors.map((x) => ({ x, n: s.shades.filter((d) => d.mirror === x.id).length }));
    const m = all.filter((e) => e.n >= need).sort((a, b) => a.n - b.n)[0];
    // What the censure would carry off: the fullest mirror.
    const taken = Math.max(0, ...all.map((e) => e.n));
    if (m && (BREAK !== 'smart' || taken - m.n >= 2)) doAct(s, { type: 'break', id: m.x.id });
  }
}

/* ---------------------------------------------------------------- dusk */

// Where each shade was posted at dusk, so those called to the line for a tide can go back to work after.
const homes = new WeakMap();

const fighter = (d) => KINDS[d.kind].fight;
const worker = (d) => KINDS[d.kind].work;

function funerals(s, plan) {
  const cap = funeralCap(s);
  const rank = { wraith: 0, restless: 1, pale: 2, stranger: 3, serene: 4, loyal: 5 };
  const bodies = [...s.bodies].sort((a, b) => rank[a.kind] - rank[b.kind]);
  let n = 0;
  for (const b of bodies) {
    if (n >= cap) break;
    const wrong = b.kind === 'wraith' || b.kind === 'restless';
    if (plan === 'mourner' || wrong || (plan === 'balanced' && s.dread >= 3 && b.kind === 'pale')) {
      if (doAct(s, { type: 'funeral', id: b.id, on: true })) n++;
    }
  }
  // Anyone left over who would overflow the mirrors gets a funeral if a priest is free.
  for (const x of crossingPreview(s)) if (x.to === 'overflow' && n < cap && doAct(s, { type: 'funeral', id: x.b.id, on: true })) n++;
}

// The line: the feet of the two stairs up to the Veil floor (or between rift and mirror, in a keep with no
// stairs). Lit, they turn every climber aside to gnaw at the light's edge, where a shade in it can fight.
const lineOf = (s) => lineSpots(geo(s));

// Where the shades not holding the line work tonight: [room, shades]. Nobody works below the line's floor,
// out where the tides and the Maws come up, except in the Choir: its essence is worth the risk.
function postings(s, ds) {
  const T = s.tuning;
  const lf = lineOf(s)[0].f;
  const rooms = [];
  const G = geo(s);
  const left = (room) => roomSpan(G, room).x0 < (MAP.LEFT + MAP.RIGHT) / 2;
  const side = roomsOf(G, 'chapel').length ? left('chapel') : true;
  const take = (room, score) => {
    if (!ds.length || !roomsOf(G, room).length) return false;
    if (room !== 'chapel' && roomSpan(G, room).f < lf && !(BELOW && left(room) === side)) return false;
    const d = [...ds].sort((a, b) => score(b) - score(a))[0];
    ds.splice(ds.indexOf(d), 1);
    const r = rooms.find((x) => x[0] === room);
    if (r) r[1].push(d);
    else rooms.push([room, [d]]);
    return true;
  };
  // Traits: a Wistful shade rests in the Cold Hearth (good dreams: the living work better); a Hoarding one sings.
  for (const d of ds.filter((x) => ST(s, x)?.dreams)) take('hearth', (x) => (x === d ? 1 : 0));
  for (const d of ds.filter((x) => ST(s, x)?.essence)) take('chapel', (x) => (x === d ? 1 : 0));
  take('chapel', worker);
  if (roomsOf(geo(s), 'forge').length) take('forge', worker);
  if (ds.some((d) => d.memory < 50 && ST(s, d)?.rests !== false)) take('hearth', (d) => (ST(s, d)?.rests === false ? -1e9 : -d.memory));
  if (capacity(s).free <= 1) take('glazier', worker);
  if (s.res.candles < 6) take('chandlery', worker);
  if (s.living.some((p) => p.sick > 0)) take('infirmary', worker);
  // The rest: the Watch before a raid, else the Choir, else rest at the Cold Hearth.
  while (ds.length && (take(T.raidDays[s.day + 1] ? 'barracks' : 'chapel', fighter) || take('chapel', fighter) || take('hearth', fighter)));
  return rooms;
}

function placeNight(s, plan) {
  const T = s.tuning;
  const G = geo(s);
  const LINE = lineOf(s);
  const line = (d) => fighter(d) * d.memory * (ST(s, d)?.fight ?? 1) * (ST(s, d)?.dreams ? 0.3 : 1);
  const ds = s.shades.filter(canWork).sort((a, b) => line(b) - line(a));
  for (const st of LINE) {
    doAct(s, { type: 'candle', f: st.f, x: st.x });
    const d = ds.shift();
    if (d) doAct(s, { type: 'move', id: d.id, f: st.f, x: st.x });
  }
  // The doubled line: a second fighter beside each stair's candle on every Maw night, taken from the rooms.
  if (plan === 'double' && s.day >= T.mawFrom && s.day < T.seasonDays) {
    for (const st of LINE) {
      const d = ds.shift();
      if (d) doAct(s, { type: 'move', id: d.id, f: st.f, x: st.x + 2 });
    }
  }
  // The new moon: no work tonight. Everyone off the line waits by the Veil for the Hollow.
  if (s.day >= T.seasonDays) {
    const { f, x0 } = roomSpan(G, 'hearth');
    ds.forEach((d, i) => doAct(s, { type: 'move', id: d.id, f, x: x0 + 14 + (i % 4) * 5 }));
    if (ds.length) doAct(s, { type: 'candle', f, x: x0 + 24 });
    return;
  }
  for (const [room, group] of postings(s, ds)) {
    const { f, x0, x1 } = roomSpan(G, room);
    // On the line's floor: just behind the line, in its light. With lineGuard on, only to keep the Watch (the
    // one job a shade guarding the line does); anything else goes to the far side of the room from the stair,
    // out of the guard light, under a candle of its own.
    const st = LINE.find((p) => p.f === f && roomAt(G, f, p.x) === roomAt(G, f, x0));
    const near = st && (!T.lineGuard || G.n === 1 || room === 'barracks');
    const mid = !st ? (x0 + x1) / 2 : near ? (st === LINE[0] ? st.x + 10 : st.x - 10) : st.x - x0 < x1 - st.x ? x1 - 8 : x0 + 8;
    group.forEach((d, i) => doAct(s, { type: 'move', id: d.id, f, x: mid - 4 + (i % 3) * 4 }));
    if (!near && s.res.candles > 1) doAct(s, { type: 'candle', f, x: mid });
  }
  homes.set(s, new Map(s.shades.filter(canWork).map((d) => [d.id, { ...d.post }])));
}

/* ---------------------------------------------------------------- night */

function tendNight(s, plan) {
  const n = s.night;
  const T = s.tuning;
  const G = geo(s);
  const LINE = lineOf(s);
  // Relight the line first, then any post whose candle is going out.
  const lit = (f, x) => n.candles.some((c) => c.f === f && Math.abs(c.x - x) <= 6 && c.wax > 15);
  for (const st of LINE) if (!lit(st.f, st.x)) doAct(s, { type: 'candle', f: st.f, x: st.x });
  const inRoom = (f, x) => n.candles.some((c) => c.f === f && roomAt(G, c.f, c.x) === roomAt(G, f, x) && c.wax > 15);
  for (const d of s.shades.filter(canWork)) {
    const { f, x } = d.post;
    if (f !== LINE[0].f && !inRoom(f, x) && s.res.candles > 1) doAct(s, { type: 'candle', f, x });
  }
  // Free the caught.
  for (const d of s.shades) if (d.grabbedBy && s.res.candles > 0) doAct(s, { type: 'candle', f: d.f, x: d.x });
  // A Maw going for a candle or a room: send the best free fighter to stand with whoever holds it.
  for (const m of n.foes.filter((f) => plan !== 'double' && f.type === 'maw' && f.target)) {
    const t = m.target;
    const at = (d) => d.f === t.f && (t.kind === 'candle' ? Math.abs(d.x - t.x) <= 8 : roomAt(G, d.f, d.x) === t.id);
    const near = s.shades.filter((d) => canWork(d) && at(d));
    if (near.length >= 2) continue;
    const help = s.shades
      .filter((d) => canWork(d) && !near.includes(d) && !d.grabbedBy && !d.climb && d.memory > 30 && !LINE.some((st) => d.post.f === st.f && d.post.x === st.x))
      .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)[0];
    if (!help || (help.post.f === t.f && Math.abs(help.post.x - t.x) <= 8)) continue;
    const x = t.x + (help.x < t.x ? -2 : 2);
    doAct(s, { type: 'move', id: help.id, f: t.f, x });
    // Don't send anyone to stand in the dark: light the spot, with the last candle if need be.
    if (!n.candles.some((c) => c.f === t.f && roomAt(G, c.f, c.x) === roomAt(G, t.f, x) && Math.abs(c.x - x) <= 12 && c.wax > 15)) doAct(s, { type: 'candle', f: t.f, x });
  }
  // The tides, announced at dusk: from a few seconds before each until it has spent itself, a second fighter
  // from the rooms stands at each stair of the line; then they go back to work. (Double never moves anyone.)
  const home = homes.get(s);
  if (plan !== 'double' && home && s.day < T.seasonDays) {
    const at = (d, p) => d.post.f === p.f && Math.abs(d.post.x - p.x) <= 3;
    const onLine = (d) => LINE.some((st) => at(d, st));
    const busy = new Set();
    for (const m of n.foes) {
      const tg = m.type === 'maw' && m.target;
      if (tg) for (const d of s.shades) if (d.post.f === tg.f && (tg.kind === 'candle' ? Math.abs(d.post.x - tg.x) <= 8 : roomAt(G, d.post.f, d.post.x) === tg.id)) busy.add(d.id);
    }
    if (n.tides.some((tt) => s.t >= tt - 50 && s.t <= tt + 350)) {
      for (const st of LINE) {
        if (s.shades.filter((d) => canWork(d) && at(d, st)).length >= 2) continue;
        // Only from the stair's own room: nobody crosses a dark floor, or climbs the tide's way, to get there.
        const d = s.shades
          .filter((x) => canWork(x) && !onLine(x) && !busy.has(x.id) && !x.grabbedBy && !x.climb && x.memory > 30 && fighter(x) >= 0.8 && roomAt(G, x.post.f, x.post.x) === roomAt(G, st.f, st.x))
          .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)[0];
        if (d) doAct(s, { type: 'move', id: d.id, f: st.f, x: st.x + 2 });
      }
    } else {
      for (const d of s.shades.filter(canWork)) {
        const h = home.get(d.id);
        if (h && onLine(d) && !LINE.some((st) => at({ post: h }, st))) doAct(s, { type: 'move', id: d.id, f: h.f, x: h.x });
      }
    }
  }
  // The last tide of the two biggest nights before the new moon: ward the stairs of the line if the
  // Choir has sung enough essence, beyond what the new moon needs to ward every stair against the Hollow.
  // Warded stairs turn the whole tide back. (Spending that reserve lost the Hollow's night: in season 2 the
  // Hollow got through 50 times in 180 with it spent, 11 without.)
  const last = n.tides[n.tides.length - 1];
  const unwarded = LINE.filter((st) => st.id && !n.wards.includes(st.id));
  const reserve = G.stairs.length * wardCost(s);
  if (plan !== 'double' && s.day >= T.seasonDays - 2 && s.day < T.seasonDays && s.t >= last - 60 && s.t <= last && unwarded.length && s.res.essence >= unwarded.length * wardCost(s) + reserve) {
    for (const st of unwarded) doAct(s, { type: 'ward', target: st.id });
  }
  // The Hollow: ward the stairs above it while the essence lasts, and meet it with fighters near the top.
  const h = n.foes.find((f) => f.type === 'hollow');
  if (h && !h.climb) {
    const up = G.stairs.filter((st) => st.f === h.f && !n.wards.includes(st.id));
    if (h.f < G.veil && up.length && s.res.essence >= up.length * wardCost(s)) for (const st of up) doAct(s, { type: 'ward', target: st.id });
    if (h.f === G.veil) {
      for (const d of s.shades.filter((x) => canWork(x) && fighter(x) >= 1 && x.memory > 30 && !x.grabbedBy && !x.climb)) {
        if (d.f !== h.f || Math.abs(d.x - h.x) > 6) doAct(s, { type: 'move', id: d.id, f: h.f, x: h.x + (d.x < h.x ? -5.5 : 5.5) });
      }
    }
  }
}

/* ---------------------------------------------------------------- dawn */

function rite(s, plan) {
  const T = s.tuning;
  const I = s.inspection;
  const inspectedToday = I && !I.done && I.day === s.day + 1;
  const soon = s.day + 1 === T.firstInspection && !s.inspections.some((x) => x.season === s.season);
  const target = plan === 'keeper' ? T.dreadMax - 1 : plan === 'mourner' ? 1 : inspectedToday || soon ? 1 : 3;
  for (const d of s.shades) {
    const cs = choicesFor(d);
    if (d.kind === 'wraith') doAct(s, { type: 'rite', id: d.id, choice: s.res.essence >= T.banishCost ? 'banish' : 'leave' });
    else if (d.kind === 'restless') doAct(s, { type: 'rite', id: d.id, choice: 'release' });
    else doAct(s, { type: 'rite', id: d.id, choice: cs[0] });
  }
  // What a shade is worth keeping, per point of Dread it costs, by its trait: an Anchored one lasts, a
  // Reckless one burns out, a Hoarding one costs a candle a night, a Keening one matters when the Restless
  // wait, a Wistful one sends good dreams, a Bitter one costs double Dread.
  const restless = s.shades.some((x) => x.kind === 'restless');
  const value = (d) => {
    const S = ST(s, d);
    let v = worker(d) * d.memory + (d.named ? 40 : 0);
    if (S?.fade) v *= S.fade < 1 ? 1.4 : 0.8;
    if (S?.work) v *= S.work;
    if (S?.pockets) v *= s.res.candles < 8 ? 0.5 : 0.8;
    if (S?.calms && restless) v *= 1.5;
    if (S?.dreams) v *= 1.5;
    return v / (S?.dread ?? 1);
  };
  const keep = s.shades.filter(canWork).sort((a, b) => value(a) - value(b));
  let P = ritePreview(s);
  while (P.dread.to > target && keep.length && plan !== 'keeper') {
    doAct(s, { type: 'rite', id: keep.shift().id, choice: 'cover' });
    P = ritePreview(s);
  }
  let v = 0;
  while (P.dread.to > target && P.remCost + T.vigilCost <= s.res.remembrance + P.rem) {
    doAct(s, { type: 'vigils', n: ++v });
    P = ritePreview(s);
  }
  // Spend what's left on the shades that stay.
  const stay = [...P.keep].sort((a, b) => a.memory - b.memory);
  const spare = () => s.res.remembrance - ritePreview(s).remCost;
  for (const d of stay) if (d.memory < 50 && spare() >= T.rememberCost + 1) doAct(s, { type: 'remember', id: d.id });
  for (const d of [...stay].reverse()) if (!d.named && d.memory >= 60 && spare() >= T.nameCost + 2) doAct(s, { type: 'name', id: d.id });
  if (!doAct(s, { type: 'beginDay' })) {
    for (const d of s.shades) doAct(s, { type: 'rite', id: d.id, choice: choicesFor(d).includes('cover') ? 'keep' : 'release' });
    doAct(s, { type: 'vigils', n: 0 });
    doAct(s, { type: 'beginDay' });
  }
}

/* ---------------------------------------------------------------- the loop */

export function autoStep(s, plan = 'balanced') {
  const way = plan === 'double' ? 'balanced' : plan; // how the dead are treated
  if (s.phase === 'day') {
    if (s.t % 50 === 0 || (s.raid?.warned && s.raid.state === 'coming' && !s.raid.ward)) dayMoves(s);
    step(s);
  } else if (s.phase === 'dusk') {
    if (s.dusk.step === 'crypt') {
      funerals(s, way);
      doAct(s, { type: 'wake' });
    }
    if (plan !== 'idle') placeNight(s, plan);
    doAct(s, { type: 'startNight' });
  } else if (s.phase === 'night') {
    if (plan !== 'idle' && s.t % 10 === 0) tendNight(s, plan);
    step(s);
  } else if (s.phase === 'dawn') {
    rite(s, way);
  }
}

// Plays whole seasons; stops at the end of the last one (or when the keep falls).
export function runSeasonAuto(seed, { plan = 'balanced', seasons = 1, tuning = {} } = {}) {
  const s = newSeason(seed, tuning);
  for (let guard = 0; guard < 2e6; guard++) {
    if (s.phase === 'over') return s;
    if (s.phase === 'end') {
      if (s.season >= seasons) return s;
      act(s, { type: 'nextSeason' });
      continue;
    }
    autoStep(s, plan);
  }
  throw new Error('Autopilot ran away');
}
