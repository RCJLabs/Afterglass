// A scripted player for the season slice, for soak tests and balance runs. It plays through act() only,
// so everything it does is replayable. Plans differ in how they treat the dead:
//   keeper   keeps every shade it can, funerals only for the dead that would wake wrong
//   mourner  holds every funeral it can and covers shades whenever Dread climbs
//   balanced keeps shades while Dread allows, and aims low before an inspection
//   double   the balanced plan, but from the first Maw night it posts two fighters on each stair of the
//            line and never sends anyone to meet a Maw: the static answer the Maws are meant to break
//   idle     works the day but leaves the night alone: no candles, no posts (a baseline)

import { step, act, newSeason, ritePreview, crossingPreview, capacity, canWork, defense, funeralCap, choicesFor } from './sim.js';
import { DAY_ROOMS, MIRRORS, KINDS } from './data.js';
import { geo, roomSpan, roomAt } from './geo.js';

export const PLANS = ['balanced', 'keeper', 'mourner', 'double', 'idle'];

const doAct = (s, a) => act(s, a).ok;

/* ---------------------------------------------------------------- day */

function wantedJobs(s) {
  const n = s.living.length;
  const r = s.raid;
  const threat = r && r.state === 'coming' && r.warned && defense(s) < r.strength;
  const food = n * s.tuning.eatPerDay + (s.res.food < n ? 2 : 0) - (s.res.food > 3 * n ? 3 : 0);
  return {
    hearth: Math.max(1, Math.ceil(food / DAY_ROOMS.hearth.rate)),
    chapel: n >= 10 ? 2 : 1,
    infirmary: s.living.some((p) => p.sick > 0) ? 1 : 0,
    chandlery: threat ? 0 : s.res.candles < 8 ? 2 : 1,
    glazier: threat || n < 6 ? 0 : 1,
  };
}

function staff(s) {
  const want = wantedJobs(s);
  const order = ['hearth', 'chapel', 'infirmary', 'chandlery', 'glazier'];
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
      const p = k === 'chapel' ? free.pop() : free.shift();
      if (p.job !== k) doAct(s, { type: 'assign', id: p.id, room: k });
      count[k]++;
    }
  }
  for (const p of free) if (p.job !== 'barracks') doAct(s, { type: 'assign', id: p.id, room: 'barracks' });
}

function dayMoves(s) {
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
}

/* ---------------------------------------------------------------- dusk */

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

// The line: the feet of the two stairs up to the Veil floor. Lit, they turn every climber aside to gnaw
// at the light's edge, where a shade standing in it can fight.
const lineOf = (s) => geo(s).stairs.filter((st) => st.f === geo(s).veil - 1);

// Where the shades not holding the line work tonight: [room, shades].
function postings(s, ds) {
  const T = s.tuning;
  const rooms = [];
  const take = (room, score) => {
    if (!ds.length) return;
    const d = [...ds].sort((a, b) => score(b) - score(a))[0];
    ds.splice(ds.indexOf(d), 1);
    const r = rooms.find((x) => x[0] === room);
    if (r) r[1].push(d);
    else rooms.push([room, [d]]);
  };
  take('chapel', worker);
  if (ds.some((d) => d.memory < 50)) take('hearth', (d) => -d.memory);
  if (capacity(s).free <= 1) take('glazier', worker);
  if (s.res.candles < 6) take('chandlery', worker);
  if (s.living.some((p) => p.sick > 0)) take('infirmary', worker);
  while (ds.length) take(T.raidDays[s.day + 1] ? 'barracks' : 'chapel', fighter);
  return rooms;
}

function placeNight(s, plan) {
  const T = s.tuning;
  const G = geo(s);
  const LINE = lineOf(s);
  const ds = s.shades.filter(canWork).sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory);
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
    const mid = f === LINE[0].f ? (room === roomAt(G, f, LINE[0].x) ? LINE[0].x + 10 : LINE[1].x - 10) : (x0 + x1) / 2;
    group.forEach((d, i) => doAct(s, { type: 'move', id: d.id, f, x: mid - 4 + (i % 3) * 4 }));
    if (!(f === LINE[0].f) && s.res.candles > 1) doAct(s, { type: 'candle', f, x: mid });
  }
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
  // A Maw going for a candle: send the best free fighter to stand with whoever holds it.
  for (const m of n.foes.filter((f) => plan !== 'double' && f.type === 'maw' && f.gnaw)) {
    const k = n.candles.find((c) => c.id === m.gnaw);
    if (!k) continue;
    const near = s.shades.filter((d) => canWork(d) && d.f === k.f && Math.abs(d.x - k.x) <= 8);
    if (near.length >= 2) continue;
    const help = s.shades
      .filter((d) => canWork(d) && !near.includes(d) && !d.grabbedBy && !d.climb && d.memory > 30 && !LINE.some((st) => d.post.f === st.f && d.post.x === st.x))
      .sort((a, b) => fighter(b) * b.memory - fighter(a) * a.memory)[0];
    if (help && !(help.post.f === k.f && Math.abs(help.post.x - k.x) <= 8)) doAct(s, { type: 'move', id: help.id, f: k.f, x: k.x + (help.x < k.x ? -2 : 2) });
  }
  // The Hollow: ward the stairs above it while the essence lasts, and meet it with fighters near the top.
  const h = n.foes.find((f) => f.type === 'hollow');
  if (h && !h.climb) {
    const up = G.stairs.filter((st) => st.f === h.f && !n.wards.includes(st.id));
    if (h.f < G.veil && up.length && s.res.essence >= up.length * T.wardCost) for (const st of up) doAct(s, { type: 'ward', target: st.id });
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
  const value = (d) => worker(d) * d.memory + (d.named ? 40 : 0);
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
