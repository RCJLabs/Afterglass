// The weeks 7–10 slice: one season in one keep. Pure and deterministic like the greyboxes: one JSON
// state, step() is one fixed tick, act() one player action, replay() rebuilds a session.
//
// The day runs the weeks 1–2 rules (the living, deaths by cause, the crypt, raids). The night runs the
// weeks 3–4 engine on the same keep's Tain (candles, Creepers, holding the light), with a job in each
// twin room. Dawn joins the weeks 1–2 rite to the weeks 3–4 fading. On top: a seven-day season with
// escalating raids, the Lantern Church's inspections, and the Hollow on the night of the new moon.

import {
  TICKS_PER_SEC, TUNING, DAY_ROOMS, WORK_ROOMS, TWINS, MAP, DEEP_FLOOR, VEIL_FLOOR, KINDS, WORKING, CAUSES, GUIDE_UP,
  MIRRORS, START_MIRRORS, MIRROR_PLACES, CAST, BONDS, START_SHADES, NAMES, RAIDER_NAMES,
} from './data.js';
import {
  roomAt, roomSpan, lightMap, isLit, spanAt, darkBetween, darkRooms, darkGaps, route, firstLight, fleePath, touching, mirrorGoals,
  GNAW_GAP,
} from './geo.js';
import { rand, randInt, pick, chance } from '../rng.js';

export const SAVE_VERSION = 1;
const EPS = 1e-9;
const DT = 1 / TICKS_PER_SEC;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;
export const fmt = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
const listNames = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const byId = (list, id) => list.find((x) => x.id === id);
export const dayTicks = (s) => Math.round(s.tuning.daySecs * TICKS_PER_SEC);
export const nightTicks = (s) => Math.round(s.tuning.nightSecs * TICKS_PER_SEC);
export const perf = (d) => 0.4 + (0.6 * Math.max(0, d.memory)) / 100;
export const isNewMoon = (s) => s.day >= s.tuning.seasonDays;
const hard = (s) => Math.pow(s.tuning.hardness, s.season - 1);

/* ---------------------------------------------------------------- setup */

export function newSeason(seed = Date.now() >>> 0, overrides = {}) {
  const tuning = { ...TUNING, ...overrides, raidDays: { ...TUNING.raidDays, ...(overrides.raidDays || {}) } };
  const s = {
    v: SAVE_VERSION,
    mode: 'season',
    seed: seed >>> 0,
    rng: seed >>> 0,
    tuning,
    tuning0: JSON.parse(JSON.stringify(tuning)),
    season: 1,
    day: 1,
    phase: 'day', // day → dusk (paused) → night → dawn (the rite, paused) → day …; 'end' after the new moon; 'over' if lost
    t: 0,
    rev: 0,
    res: { food: tuning.startFood, candles: tuning.startCandles, glass: tuning.startGlass, essence: 0, remembrance: 0 },
    dread: 0,
    cracks: 0,
    living: [],
    bodies: [],
    shades: [],
    mirrors: [],
    raid: null,
    events: [],
    heal: 0,
    hungry: false,
    starve: 0,
    guidance: 0,
    watchBonus: 0,
    inspection: null,
    inspections: [],
    dusk: null,
    night: null,
    rite: null,
    over: null,
    nextId: 1,
    used: [],
    log: [],
    alerts: [],
    actions: [],
    ledger: [],
    days: [],
    seasons: [],
    today: blankToday(),
  };
  const cast = {};
  for (const c of CAST) {
    const p = newPerson(s, c.name, c.age, c.job);
    s.living.push(p);
    cast[c.name] = p;
  }
  for (const [a, b, rel] of BONDS) bond(cast[a], cast[b], rel);
  for (const [type, place] of START_MIRRORS) addMirror(s, type, place);
  for (const x of START_SHADES) {
    const d = newShade(s, { id: 'p' + s.nextId++, name: x.name, kind: x.kind, cause: x.cause, from: 'living', day: 0, memory: x.memory, named: x.named, post: { f: x.post[0], x: x.post[1] } });
    s.used.push(x.name);
    d.mirror = s.mirrors[0].id;
    if (x.bond) {
      const p = cast[x.bond[0]];
      p.bond = { with: d.id, rel: x.bond[1] };
      d.bond = { with: p.id, rel: x.bond[1] };
    }
    s.shades.push(d);
    s.ledger.push({ id: d.id, name: d.name, from: 'before', season: 0, day: 0, cause: x.cause, how: CAUSES[x.cause].text, kind: x.kind, guided: false, job: null, woke: x.kind, end: null, endDay: null, nights: 0 });
  }
  rollDay(s);
  say(s, `Season 1, day 1. The new moon is ${tuning.seasonDays} days off. Anyone who dies inside the walls wakes at dusk as a shade.`, 'day');
  return s;
}

function blankToday() {
  return { made: {}, deaths: [], arrivals: [], raid: null, inspection: null, night: null };
}

function newPerson(s, name, age, job = null) {
  if (!s.used.includes(name)) s.used.push(name);
  return { id: 'p' + s.nextId++, name, age, job, bond: null, sick: 0, grief: null, peace: 0, joined: s.day };
}
function bond(a, b, rel) {
  a.bond = { with: b.id, rel };
  b.bond = { with: a.id, rel };
}
function freshName(s, list) {
  const free = list.filter((n) => !s.used.includes(n));
  const name = free.length ? pick(s, free) : `${pick(s, list)} ${s.nextId}`;
  s.used.push(name);
  return name;
}
function addMirror(s, type, place) {
  const m = { id: 'm' + s.nextId++, type, name: `${place} ${MIRRORS[type].name}` };
  s.mirrors.push(m);
  return m;
}
function nextPlace(s) {
  const taken = s.mirrors.map((m) => m.name.split(' ')[0]);
  return MIRROR_PLACES.find((p) => !taken.includes(p)) || `Mirror ${s.mirrors.length + 1}`;
}
function say(s, text, tone = '', alert = false) {
  s.log.push({ season: s.season, day: s.day, phase: s.phase, t: s.t, text, tone });
  if (s.log.length > 800) s.log.splice(0, s.log.length - 800);
  if (alert) s.alerts.push({ text, tone });
  s.rev++;
}
function gain(s, res, n) {
  s.res[res] += n;
  s.today.made[res] = (s.today.made[res] || 0) + n;
}

/* ---------------------------------------------------------------- derived values */

export const mirrorCap = (m) => MIRRORS[m.type].cap;
export const mirrorUse = (s, m) => s.shades.filter((d) => d.mirror === m.id).length;
export function capacity(s) {
  let cap = 0;
  let used = 0;
  for (const m of s.mirrors) {
    cap += mirrorCap(m);
    used += mirrorUse(s, m);
  }
  return { cap, used, free: cap - used };
}
const freeMirror = (s) => s.mirrors.find((m) => mirrorUse(s, m) < mirrorCap(m)) || null;
export const canWork = (d) => !!d.mirror && WORKING.includes(d.kind);
export const postRoom = (d) => (d.post ? roomAt(d.post.f, d.post.x) : null);
export const griefMult = (s, p) => (p.grief ? p.grief.mult : 1);
export const bondedShade = (s, p) => (p.bond ? byId(s.shades, p.bond.with) : null);
// A living worker and a bonded shade posted in the twin of the same room work x1.25, both of them.
export function isTwinnedLiving(s, p) {
  const d = bondedShade(s, p);
  return !!(d && p.job && canWork(d) && postRoom(d) === p.job);
}
export function isTwinnedShade(s, d) {
  if (!d.bond || !canWork(d)) return false;
  const p = byId(s.living, d.bond.with);
  return !!(p && p.job && postRoom(d) === p.job);
}
export function livingMult(s, p) {
  if (!p.job) return 0;
  const T = s.tuning;
  let m = 1;
  if (p.sick > 0) m *= T.sickMult;
  if (s.hungry) m *= T.hungryMult;
  m *= griefMult(s, p);
  if (p.peace > 0) m *= T.peaceMult;
  if (isTwinnedLiving(s, p)) m *= T.twinMult;
  return m;
}
export function roomPower(s) {
  const out = Object.fromEntries(Object.keys(DAY_ROOMS).map((r) => [r, 0]));
  for (const p of s.living) if (p.job) out[p.job] += livingMult(s, p);
  return out;
}
export const defense = (s) => roomPower(s).barracks * DAY_ROOMS.barracks.rate + (s.raid?.ward || 0) + (s.watchBonus || 0);
export const priests = (s) => s.living.filter((p) => p.job === 'chapel').length;
export const funeralCap = priests;
export const eatRate = (s) => s.living.length * s.tuning.eatPerDay;
export const bear = (s) => Math.floor(s.living.length / s.tuning.dreadLivingPer) + priests(s);

/* ---------------------------------------------------------------- the clock */

export function step(s) {
  if (s.phase === 'day') dayTick(s);
  else if (s.phase === 'night') nightTick(s);
}

function dayTick(s) {
  const D = dayTicks(s);
  s.t++;
  const pw = roomPower(s);
  for (const r of WORK_ROOMS) {
    const R = DAY_ROOMS[r];
    if (R.out in s.res) gain(s, R.out, (pw[r] * R.rate) / D);
  }
  heal(s, (pw.infirmary * DAY_ROOMS.infirmary.rate) / D);
  eat(s, D);
  for (const p of [...s.living]) {
    if (s.phase !== 'day') return;
    if (p.peace > 0 && --p.peace === 0) s.rev++;
    if (p.sick > 0 && --p.sick <= 0) {
      p.sick = 0;
      kill(s, p, 'sickness');
    }
  }
  while (s.phase === 'day' && s.events.length && s.events[0].at <= s.t) fire(s, s.events.shift());
  if (s.phase === 'day' && s.t >= D) endDay(s);
}

function heal(s, amount) {
  const sick = s.living.filter((p) => p.sick > 0);
  if (!sick.length) {
    s.heal = 0;
    return;
  }
  s.heal += amount;
  while (s.heal >= 1 - EPS && sick.length) {
    sick.sort((a, b) => a.sick - b.sick);
    const p = sick.shift();
    p.sick = 0;
    s.heal -= 1;
    say(s, `${p.name} recovered in the infirmary.`, 'good');
  }
}

function eat(s, D) {
  const need = eatRate(s) / D;
  if (s.res.food + EPS >= need) {
    s.res.food = Math.max(0, s.res.food - need);
    if (s.hungry && s.res.food >= 1) {
      s.hungry = false;
      s.starve = 0;
      say(s, 'There is food in the larder again.', 'good');
    }
    return;
  }
  s.res.food = 0;
  if (!s.hungry) {
    s.hungry = true;
    say(s, 'The larder is empty. Everyone works hungry, and the weakest will starve.', 'bad', true);
  }
  s.starve += 1 / D;
  if (s.starve >= s.tuning.starveDays - EPS) {
    s.starve = 0;
    const score = (p) => (p.sick > 0 ? 0 : 10) + (p.age === 'old' ? 0 : p.age === 'young' ? 2 : 4);
    const v = [...s.living].sort((a, b) => score(a) - score(b))[0];
    if (v) kill(s, v, 'neglect');
  }
}

function rollDay(s) {
  const T = s.tuning;
  const D = dayTicks(s);
  s.events = [];
  s.raid = null;
  const base = T.raidDays[s.day];
  if (base) s.raid = newRaid(s, base * hard(s), Math.round(T.raidWarnAt * D), Math.round(T.raidHitAt * D));
  if (chance(s, T.sickChance)) s.events.push({ at: Math.round((0.1 + rand(s) * 0.5) * D), type: 'sick' });
  for (const p of s.living) {
    if (p.age === 'old' && chance(s, T.oldAgeChance)) s.events.push({ at: Math.round((0.15 + rand(s) * 0.8) * D), type: 'oldage', id: p.id });
  }
  if (s.inspection && !s.inspection.done && s.inspection.day === s.day) s.events.push({ at: Math.round(T.inspectAt * D), type: 'inspect' });
  s.events.sort((a, b) => a.at - b.at);
}

function newRaid(s, base, warnAt, hitAt) {
  const T = s.tuning;
  const strength = r1(Math.max(2, base + (rand(s) * 2 - 1) * T.raidSpread));
  const raid = { strength, count: Math.max(2, Math.round(strength / 2)), ward: 0, state: 'coming', warned: false, warnAt, hitAt };
  s.events.push({ at: warnAt, type: 'raidWarn' }, { at: hitAt, type: 'raidHit' });
  s.events.sort((a, b) => a.at - b.at);
  return raid;
}

function fire(s, e) {
  if (e.type === 'sick') {
    const well = s.living.filter((p) => !(p.sick > 0));
    if (!well.length) return;
    const p = pick(s, well);
    p.sick = Math.round(s.tuning.sickDays * dayTicks(s));
    say(s, `${p.name} has fallen sick. Untreated, the sickness kills within ${fmt(s.tuning.sickDays)} days.`, 'bad', true);
  } else if (e.type === 'oldage') {
    const p = byId(s.living, e.id);
    if (p) kill(s, p, 'oldage');
  } else if (e.type === 'raidWarn') {
    const r = s.raid;
    if (!r || r.state !== 'coming') return;
    r.warned = true;
    say(s, `Raiders on the road: ${r.count} of the Ashen Host, strength ${fmt(r.strength)}. Your defense is ${fmt(defense(s))}.`, 'bad', true);
  } else if (e.type === 'raidHit') {
    resolveRaid(s);
  } else if (e.type === 'inspect') {
    inspect(s);
  }
}

function resolveRaid(s) {
  const r = s.raid;
  if (!r || r.state !== 'coming') return;
  const T = s.tuning;
  const def = defense(s);
  const held = def + EPS >= r.strength;
  const ratio = r.strength / Math.max(def, 0.5);
  const fallen = [];
  for (const g of s.living.filter((p) => p.job === 'barracks')) {
    if (chance(s, clamp((held ? T.raidRiskHeld : T.raidRiskBreach) * ratio, 0.02, T.raidRiskMax))) fallen.push({ p: g, how: 'died holding the gate' });
  }
  const raiders = held ? (chance(s, T.raidInsideHeld) ? 1 : 0) : 1 + randInt(s, Math.ceil(r.count / 2));
  let loot = '';
  if (!held) {
    const civ = s.living.filter((p) => p.job !== 'barracks');
    if (civ.length) fallen.push({ p: pick(s, civ), how: 'was cut down in the yard' });
    const food = Math.floor(s.res.food * T.raidLoot * 0.5); // the Granary keeps half the food out of their hands
    const glass = Math.floor(s.res.glass * T.raidLoot);
    const candles = Math.floor(s.res.candles * T.raidLoot);
    s.res.food -= food;
    s.res.glass -= glass;
    s.res.candles -= candles;
    loot = ` They carried off ${food} food, ${glass} glass and ${candles} candles.`;
  }
  r.state = held ? 'held' : 'breached';
  s.today.raid = { strength: r.strength, defense: r1(def), held };
  say(
    s,
    held ? `The gate held against ${r.count} raiders (defense ${fmt(def)} against strength ${fmt(r.strength)}).` : `The raiders broke through (defense ${fmt(def)} against strength ${fmt(r.strength)}).${loot}`,
    held ? 'good' : 'bad',
    true,
  );
  for (const f of fallen) kill(s, f.p, 'duty', f.how);
  for (let i = 0; i < raiders; i++) raiderBody(s);
  if (raiders) say(s, held ? 'One raider fell inside the gatehouse. The body lies in the crypt.' : `${raiders} raider${raiders === 1 ? ' was' : 's were'} cut down inside the walls. The bodies lie in the crypt.`);
}

// The Lantern Church judges the keep by its Dread at noon.
function inspect(s) {
  const I = s.inspection;
  if (!I || I.done) return;
  const d = s.dread;
  let verdict;
  let text;
  if (d <= 1) {
    verdict = 'blessed';
    s.res.candles += 3;
    gain(s, 'remembrance', 2);
    text = 'The Lantern Church inspector finds a keep at peace with its dead, and blesses it: 3 candles and 2 remembrance.';
  } else if (d <= 3) {
    verdict = 'warned';
    let tithe;
    if (s.res.essence >= 5) {
      s.res.essence -= 5;
      tithe = '5 essence';
    } else if (s.res.remembrance >= 5) {
      s.res.remembrance -= 5;
      tithe = '5 remembrance';
    } else if (s.res.candles >= 3) {
      s.res.candles -= 3;
      tithe = '3 candles';
    } else {
      tithe = `${Math.floor(s.res.remembrance)} remembrance, all you had`;
      s.res.remembrance = 0;
    }
    s.dread = Math.max(0, d - 1);
    text = `The Lantern Church inspector warns you and takes a tithe of ${tithe}. Dread ${d} → ${s.dread}.`;
  } else {
    verdict = 'censured';
    const groups = s.mirrors.map((m) => ({ m, ds: s.shades.filter((x) => x.mirror === m.id) })).sort((a, b) => b.ds.length - a.ds.length || MIRRORS[b.m.type].cap - MIRRORS[a.m.type].cap);
    const g = groups[0];
    if (g) {
      for (const x of g.ds) {
        s.shades.splice(s.shades.indexOf(x), 1);
        endLedger(s, x.id, 'taken');
        restFor(s, x.id, false);
      }
      s.mirrors.splice(s.mirrors.indexOf(g.m), 1);
    }
    s.dread = 2;
    text = g
      ? `The Lantern Church inspector censures the keep, covers the ${g.m.name}${g.ds.length ? ` and takes ${listNames(g.ds.map((x) => x.name))}` : ''}, and carries the mirror away. Dread ${d} → 2.`
      : `The Lantern Church inspector censures the keep. Dread ${d} → 2.`;
  }
  I.done = true;
  I.verdict = verdict;
  I.dread = d;
  s.inspections.push({ season: s.season, day: s.day, reason: I.reason, verdict, dread: d });
  s.today.inspection = { verdict, dread: d };
  say(s, text, verdict === 'blessed' ? 'good' : 'bad', true);
}

/* ---------------------------------------------------------------- death */

export function kill(s, p, cause, how) {
  const i = s.living.indexOf(p);
  if (i < 0) return null;
  s.living.splice(i, 1);
  let kind = CAUSES[cause].kind;
  let guided = false;
  if (s.guidance > 0 && GUIDE_UP[kind]) {
    kind = GUIDE_UP[kind];
    s.guidance--;
    guided = true;
  }
  const b = { id: p.id, name: p.name, age: p.age, job: p.job, bond: p.bond, cause, kind, guided, how: how || CAUSES[cause].text, day: s.day, funeral: false, from: 'living' };
  s.bodies.push(b);
  s.today.deaths.push(p.id);
  addLedger(s, b);
  let grief = '';
  const q = p.bond ? byId(s.living, p.bond.with) : null;
  if (q) {
    q.grief = { for: p.id, mult: s.tuning.griefMult };
    q.peace = 0;
    grief = ` ${q.name} grieves.`;
  }
  say(s, `${p.name} ${b.how}.${guided ? ' The Threshold eased the passing.' : ''}${grief}`, 'death', true);
  if (!s.living.length) lose(s, 'fallen', 'No one living is left. The keep has fallen.');
  return b;
}
function raiderBody(s) {
  const b = {
    id: 'r' + s.nextId++, name: freshName(s, RAIDER_NAMES), age: 'adult', job: null, bond: null, cause: 'raider', kind: 'stranger',
    guided: false, how: CAUSES.raider.text, day: s.day, funeral: false, from: 'raider',
  };
  s.bodies.push(b);
  addLedger(s, b);
}
function addLedger(s, b) {
  s.ledger.push({ id: b.id, name: b.name, from: b.from, season: s.season, day: b.day, cause: b.cause, how: b.how, kind: b.kind, guided: b.guided, job: b.job, woke: null, end: null, endDay: null, nights: 0 });
}
export const ledgerOf = (s, id) => s.ledger.find((e) => e.id === id);
function endLedger(s, id, end) {
  const e = ledgerOf(s, id);
  if (e && !e.end) {
    e.end = end;
    e.endDay = s.day;
  }
}
function restFor(s, deadId, peace) {
  for (const p of s.living) {
    if (p.grief && p.grief.for === deadId) {
      p.grief = null;
      if (peace) {
        p.peace = Math.round(s.tuning.peaceDays * dayTicks(s));
        say(s, `${p.name} is at peace.`, 'good');
      }
    }
  }
}
function lose(s, reason, text) {
  s.phase = 'over';
  s.over = { reason, season: s.season, day: s.day };
  closeSeason(s, s.night ? s.night.stats.cracks : 0, reason);
  say(s, text, 'bad', true);
}

/* ---------------------------------------------------------------- dusk: the Crossing */

function endDay(s) {
  s.phase = 'dusk';
  s.t = 0;
  s.events = [];
  s.watchBonus = 0;
  s.dusk = { step: s.bodies.length ? 'crypt' : 'place' };
  s.night = newNight(s);
  const n = s.bodies.length;
  say(s, n ? `Dusk. ${n} ${n === 1 ? 'body lies' : 'bodies lie'} in the crypt. Hold funerals or let them wake.` : 'Dusk. Set the candles and post the shades.', 'dusk', true);
}

export function crossingPreview(s) {
  const cap = funeralCap(s);
  let buried = 0;
  const use = Object.fromEntries(s.mirrors.map((m) => [m.id, mirrorUse(s, m)]));
  return s.bodies.map((b) => {
    if (b.funeral && buried < cap) {
      buried++;
      return { b, to: 'funeral' };
    }
    if (b.kind === 'wraith' || b.kind === 'restless') return { b, to: b.kind };
    const m = s.mirrors.find((x) => use[x.id] < mirrorCap(x));
    if (!m) return { b, to: 'overflow' };
    use[m.id]++;
    return { b, to: 'mirror', mirror: m };
  });
}

function bury(s, b) {
  gain(s, 'remembrance', 1);
  const e = ledgerOf(s, b.id);
  if (e) e.woke = 'funeral';
  endLedger(s, b.id, 'funeral');
  say(s, b.from === 'raider' ? `${b.name} was burned with the Host's dead.` : `${b.name} was laid to rest.`, 'rest');
  restFor(s, b.id, true);
}

// A free spot in the Waking Room for the newly woken.
function wakingSpot(s) {
  const { f, x0 } = roomSpan('crypt');
  const taken = s.shades.filter((d) => d.post && d.post.f === f).map((d) => d.post.x);
  for (let i = 0; i < 12; i++) {
    const x = x0 + 8 + ((i * 7) % 36);
    if (taken.every((t) => Math.abs(t - x) >= 5)) return { f, x };
  }
  return { f, x: x0 + 20 };
}

function newShade(s, o) {
  const post = o.post || wakingSpot(s);
  return {
    id: o.id, name: o.name, kind: o.kind, trueKind: null, mirror: null, bond: o.bond || null, cause: o.cause, from: o.from, day: o.day,
    job: o.job || null, memory: o.memory ?? 100, named: !!o.named, nights: 0, rites: 0, restless: 0, post, f: post.f, x: post.x,
    ox: post.x, of: post.f, path: [], climb: 0, climbTotal: 0, grabbedBy: null, rest: 0, sang: 0, watch: 0, drained: 0,
  };
}

function rise(s, b, x) {
  const d = newShade(s, b);
  let text;
  if (x.to === 'mirror') {
    d.mirror = x.mirror.id;
    text = `${b.name} wakes ${KINDS[d.kind].name} in the ${x.mirror.name}.`;
  } else if (x.to === 'overflow') {
    d.trueKind = d.kind;
    d.kind = 'restless';
    text = `${b.name} wakes Restless at the edge of the Deep. No mirror had room.`;
  } else if (x.to === 'restless') text = `${b.name} wakes Restless at the edge of the Deep.`;
  else text = `${b.name} wakes as a Wraith.`;
  const e = ledgerOf(s, b.id);
  if (e) e.woke = x.to === 'overflow' ? 'overflow' : d.kind;
  s.shades.push(d);
  say(s, text, d.mirror ? 'wake' : 'bad');
}

/* ---------------------------------------------------------------- the night */

function newNight(s) {
  const T = s.tuning;
  const N = nightTicks(s);
  const count = Math.round((T.creepersBase + T.creepersPerNight * Math.min(s.day, T.seasonDays - 1)) * (isNewMoon(s) ? T.newMoonCreepers : 1) * hard(s));
  // The Unlit come in tides: a few stragglers, and the rest in waves that can swamp one candle.
  const waves = 1 + Math.floor(s.day / T.tideEvery);
  const tides = Array.from({ length: waves }, (_, w) => 0.12 + (0.7 * (w + 0.2 + 0.6 * rand(s))) / waves);
  const spawns = [];
  for (let i = 0; i < count; i++) {
    const straggler = chance(s, T.stragglers);
    const at = straggler ? 0.05 + 0.85 * rand(s) : tides[i % waves] + (rand(s) - 0.5) * T.tideSpread;
    spawns.push({
      at: Math.round(clamp(at, 0.02, 0.92) * N), type: 'creeper', seep: s.day >= T.seepFrom && chance(s, T.seepShare),
      snuff: chance(s, T.snuffShare), rift: pick(s, MAP.rifts).id,
    });
  }
  if (isNewMoon(s)) spawns.push({ at: Math.round(T.hollowAt * N), type: 'hollow', seep: false, snuff: false, rift: pick(s, MAP.rifts).id });
  spawns.sort((a, b) => a.at - b.at);
  return {
    candles: [], foes: [], spawns, tides: tides.map((x) => Math.round(x * N)).sort((a, b) => a - b), wards: [], wardHold: {}, hush: false,
    stats: { spawned: 0, killed: 0, crossed: 0, cracks: 0, grabbed: 0, drained: 0, essence: 0, glass: 0, wick: 0, guidance: 0, candles: 0, wards: 0, lost: [], hollow: null, taken: null, wraiths: 0 },
  };
}

function startNight(s) {
  s.phase = 'night';
  s.t = 0;
  s.dusk = null;
  for (const d of s.shades) {
    Object.assign(d, { path: [], climb: 0, grabbedBy: null, rest: 0, sang: 0, watch: 0, drained: 0 });
    if (canWork(d)) Object.assign(d, { f: d.post.f, x: d.post.x, ox: d.post.x, of: d.post.f });
  }
  const { f, x0 } = roomSpan('crypt');
  for (const [i, w] of s.shades.filter((d) => d.kind === 'wraith').entries()) {
    addFoe(s, 'wraith', f, x0 + 10 + i * 9, { shade: w.id, temper: 'snuff' });
    s.night.stats.wraiths++;
  }
  say(s, `Night ${s.day}${isNewMoon(s) ? ': the new moon. The Hollow will rise' : ''}. ${s.night.spawns.filter((x) => x.type === 'creeper').length} Creepers will come before dawn.`, 'night', isNewMoon(s));
  if (s.night.stats.wraiths) say(s, `${listNames(s.shades.filter((d) => d.kind === 'wraith').map((d) => d.name))} ${s.night.stats.wraiths === 1 ? 'rises' : 'rise'} as a Wraith in the Waking Room.`, 'bad', true);
}

function addFoe(s, type, f, x, extra = {}) {
  const T = s.tuning;
  const hp = type === 'hollow' ? T.hollowHp * hard(s) : type === 'wraith' ? T.wraithHp : T.creeperHp;
  const foe = {
    id: 'c' + s.nextId++, type, f, x, ox: x, of: f, hp, max: hp, path: [], climb: 0, climbTotal: 0, temper: extra.temper || 'climb',
    mode: 'climb', prey: null, gnaw: null, gnawing: false, grab: null, replan: 0, shade: extra.shade || null, batter: null,
  };
  s.night.foes.push(foe);
  return foe;
}
export const addCreeper = (s, f, x, temper = 'climb') => addFoe(s, 'creeper', f, x, { temper });

function advance(u, speed, climbTicks) {
  u.ox = u.x;
  u.of = u.f;
  if (u.climb > 0) {
    if (--u.climb === 0) {
      const st = u.path.shift();
      u.f = st.f;
      u.x = st.x;
      u.of = u.f;
      u.ox = u.x;
    }
    return;
  }
  let budget = speed * DT;
  while (u.path.length && budget > EPS) {
    const st = u.path[0];
    if (st.climb) {
      u.climb = climbTicks;
      u.climbTotal = climbTicks;
      return;
    }
    const dx = st.x - u.x;
    if (Math.abs(dx) <= budget) {
      u.x = st.x;
      budget -= Math.abs(dx);
      u.path.shift();
    } else {
      u.x += Math.sign(dx) * budget;
      budget = 0;
    }
  }
}

function nightTick(s) {
  const n = s.night;
  const T = s.tuning;
  s.t++;
  const L = lightMap(T, n.candles);
  spawnFoes(s, L);
  for (const c of n.candles) c.wax -= DT;
  for (const h of n.foes) {
    if (h.type !== 'hollow' || h.hp <= 0 || h.climb) continue;
    for (const c of n.candles) if (c.f === h.f && Math.abs(c.x - h.x) <= T.hollowReach) c.wax -= T.hollowEat * DT;
  }
  for (const d of [...s.shades]) if (canWork(d) && s.shades.includes(d)) shadeTick(s, L, d);
  for (const f of [...n.foes]) foeTick(s, L, f);
  if (s.phase !== 'night') return;
  for (const f of n.foes) if (f.hp <= 0) foeDown(s, f);
  n.foes = n.foes.filter((f) => f.hp > 0);
  n.candles = n.candles.filter((c) => c.wax > 0);
  if (s.t >= nightTicks(s)) endNight(s);
}

function spawnFoes(s, L) {
  const n = s.night;
  while (n.spawns.length && n.spawns[0].at <= s.t) {
    const sp = n.spawns.shift();
    const open = MAP.rifts.filter((r) => !n.wards.includes(r.id));
    const rift = open.find((r) => r.id === sp.rift) || open[0] || null;
    let at = null;
    if (sp.type !== 'hollow' && (sp.seep || !rift)) {
      const dark = darkRooms(L);
      if (dark.length) {
        const [f, id, a, b] = pick(s, dark);
        at = { f, x: a + (b - a) * (0.25 + 0.5 * rand(s)) };
        say(s, `The Unlit seep up in the ${TWINS[id].name}. It has no candle.`, 'bad', n.foes.length < 3);
      } else if (!rift) {
        // Every rift warded and every room lit: they come up wherever the light doesn't reach.
        const gaps = darkGaps(L);
        if (gaps.length) {
          const [f, a, b] = pick(s, gaps);
          at = { f, x: (a + b) / 2 };
        }
      }
    }
    // Wards can't hold the new moon: the Hollow breaks through its rift whatever seals it.
    if (!at) at = { f: DEEP_FLOOR, x: (rift || byId(MAP.rifts, sp.rift)).x };
    addFoe(s, sp.type, at.f, at.x, { temper: sp.snuff ? 'snuff' : 'climb' });
    n.stats.spawned++;
    if (sp.type === 'hollow') {
      n.stats.hollow = 'rose';
      say(s, 'The Hollow rises out of the Deep. It eats the light around it and makes for the mirrors.', 'bad', true);
    }
  }
}

function drainShade(s, d, amount) {
  d.memory -= amount;
  d.drained += amount;
  s.night.stats.drained += amount;
  if (d.memory <= 0) fadeAway(s, d, `${d.name} was drained to nothing in the ${TWINS[roomAt(d.f, d.x) || 'crypt'].name} and is gone.`);
}

function shadeTick(s, L, d) {
  const T = s.tuning;
  const n = s.night;
  const K = KINDS[d.kind];
  if (d.grabbedBy) {
    const f = byId(n.foes, d.grabbedBy);
    if (!f || f.grab !== d.id || n.hush) {
      d.grabbedBy = null;
      if (f && f.grab === d.id) f.grab = null;
    } else {
      drainShade(s, d, (f.type === 'wraith' ? T.wraithDrain : T.drainPerSec) * DT);
      return;
    }
  }
  advance(d, T.shadeSpeed * K.speed, Math.round(T.shadeClimb * TICKS_PER_SEC));
  if (d.climb || n.hush) return;
  const p = perf(d);
  // Hold: a shade in light defends that light, stepping to whichever edge is attacked, never past it.
  const span = !d.path.length && spanAt(L, d.f, d.x);
  if (span) {
    const threat = n.foes
      .filter((c) => c.f === d.f && !c.climb && c.hp > 0 && c.x >= span[0] - 5 && c.x <= span[1] + 5)
      .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
    const home = d.post.f === d.f && d.post.x >= span[0] && d.post.x <= span[1] ? d.post.x : d.x;
    const goal = threat ? clamp(threat.x, span[0] + 1, span[1] - 1) : home;
    const stepPx = T.shadeSpeed * K.speed * DT;
    d.x = Math.abs(goal - d.x) <= stepPx ? goal : d.x + Math.sign(goal - d.x) * stepPx;
  }
  const foe = n.foes
    .filter((c) => c.f === d.f && !c.climb && c.hp > 0 && Math.abs(c.x - d.x) <= T.reach)
    .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];
  if (foe) {
    foe.hp -= T.fightDps * K.fight * p * DT;
    return;
  }
  if (d.path.length || d.post.f !== d.f || Math.abs(d.post.x - d.x) > 1.5 || !isLit(L, d.f, d.x)) return;
  const room = roomAt(d.f, d.x);
  const job = room && TWINS[room].job;
  const w = K.work * p * (isTwinnedShade(s, d) ? T.twinMult : 1) * DT;
  if (job === 'essence') {
    gain(s, 'essence', T.essencePerSec * w);
    n.stats.essence += T.essencePerSec * w;
    d.sang++;
  } else if (job === 'glass') {
    gain(s, 'glass', T.glassPerSec * w);
    n.stats.glass += T.glassPerSec * w;
  } else if (job === 'wick') n.stats.wick += T.wickPerSec * w;
  else if (job === 'guidance') n.stats.guidance += T.guidePerSec * w;
  else if (job === 'watch') d.watch++;
  else if (job === 'rest') d.rest++;
}

function foeTick(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  if (c.hp <= 0 || s.phase !== 'night') return;
  c.gnawing = false;
  if (c.type === 'hollow') {
    hollowTick(s, L, c);
    return;
  }
  const lit = !c.climb && isLit(L, c.f, c.x);
  if (c.grab) {
    const d = byId(s.shades, c.grab);
    if (!d || d.grabbedBy !== c.id || n.hush || lit) {
      if (d && d.grabbedBy === c.id) d.grabbedBy = null;
      c.grab = null;
      c.replan = 0;
    } else return;
  }
  if (lit) {
    c.hp -= T.burnDps * (c.type === 'wraith' ? 0.5 : 1) * DT;
    if (c.mode !== 'flee') {
      c.mode = 'flee';
      c.path = fleePath(L, c);
      c.replan = 10;
    }
  }
  if (--c.replan <= 0 && !c.climb) plan(s, L, c);
  advance(c, c.type === 'wraith' ? T.wraithSpeed : T.creeperSpeed, Math.round(T.creeperClimb * TICKS_PER_SEC));
  if (c.climb) return;
  if (c.type === 'creeper' && c.f === VEIL_FLOOR) {
    const m = MAP.mirrors.find((x) => Math.abs(x.x - c.x) < 2);
    if (m) {
      cross(s, c, m, 1);
      return;
    }
  }
  if (c.mode === 'hunt' && !n.hush) {
    const d = byId(s.shades, c.prey);
    if (d && canWork(d) && !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - c.x) < 2.5 && !isLit(L, d.f, d.x)) {
      c.grab = d.id;
      c.path = [];
      d.grabbedBy = c.id;
      d.path = [];
      n.stats.grabbed++;
      say(s, `${c.type === 'wraith' ? 'A Wraith' : 'A Creeper'} has caught ${d.name} in the dark of the ${TWINS[roomAt(d.f, d.x) || 'crypt'].name}.`, 'bad', true);
    }
  }
  if (c.mode === 'gnaw' && !c.path.length) {
    const k = byId(n.candles, c.gnaw);
    if (k && touching(L, c, k.id)) {
      k.wax -= T.gnawRate * (c.type === 'wraith' ? 2 : 1) * DT;
      c.gnawing = true;
    } else c.replan = 0;
  }
}

function plan(s, L, c) {
  const T = s.tuning;
  const n = s.night;
  c.replan = 5;
  if (isLit(L, c.f, c.x)) {
    c.mode = 'flee';
    c.path = fleePath(L, c);
    return;
  }
  if (!n.hush) {
    const sense = c.type === 'wraith' ? 40 : T.senseRange;
    const prey = s.shades
      .filter((d) => canWork(d) && !d.grabbedBy && !d.climb && d.f === c.f && Math.abs(d.x - c.x) <= sense && !isLit(L, d.f, d.x) && darkBetween(L, c.f, c.x, d.x))
      .sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
    if (prey) {
      c.mode = 'hunt';
      c.prey = prey.id;
      c.path = [{ f: c.f, x: prey.x }];
      return;
    }
  }
  if (c.temper === 'snuff') {
    const edges = [];
    for (let f = 0; f < L.spans.length; f++) {
      for (const [a, b, id] of L.spans[f]) for (const x of [a - GNAW_GAP, b + GNAW_GAP]) if (x >= MAP.LEFT && x <= MAP.RIGHT - 1 && !isLit(L, f, x)) edges.push({ f, x, candle: id });
    }
    const to = edges.length && route(L, c, edges, { creeper: true, wards: n.wards });
    if (to) {
      c.mode = 'gnaw';
      c.gnaw = to.goal.candle;
      c.path = to.path;
      return;
    }
  }
  if (c.type === 'wraith') {
    c.mode = 'idle';
    c.path = [];
    return;
  }
  const r = route(L, c, mirrorGoals(), { creeper: true, wards: n.wards });
  if (r) {
    c.mode = 'climb';
    c.gnaw = null;
    c.path = r.path;
    return;
  }
  const open = route(L, c, mirrorGoals(), { creeper: true, ignoreLight: true, wards: n.wards });
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

// The Hollow makes for the mirrors whatever the light, eating candles and draining shades as it goes.
// A ward on a stair only holds it a while; only shades standing and fighting drive it back.
function hollowTick(s, L, h) {
  const T = s.tuning;
  const n = s.night;
  if (!n.hush) {
    for (const d of s.shades) {
      if (canWork(d) && s.shades.includes(d) && !d.climb && d.f === h.f && Math.abs(d.x - h.x) <= 5) drainShade(s, d, T.hollowDrain * DT);
    }
  }
  if (!h.climb && --h.replan <= 0) {
    h.replan = 10;
    h.batter = null;
    let r = route(L, h, mirrorGoals(), { creeper: true, ignoreLight: true, wards: n.wards });
    if (!r) {
      // Every way up is warded: go and break the nearest ward.
      const open = route(L, h, mirrorGoals(), { creeper: true, ignoreLight: true });
      const i = open ? open.path.findIndex((st) => st.climb && n.wards.includes(st.climb)) : -1;
      if (i >= 0) {
        h.batter = open.path[i].climb;
        r = { path: open.path.slice(0, i) };
      }
    }
    h.path = r ? r.path : [];
    h.mode = h.batter ? 'batter' : r ? 'climb' : 'idle';
  }
  if (h.batter && !h.path.length) {
    h.gnawing = true;
    n.wardHold[h.batter] = (n.wardHold[h.batter] ?? T.wardHold) - DT;
    if (n.wardHold[h.batter] <= EPS) {
      n.wards = n.wards.filter((w) => w !== h.batter);
      delete n.wardHold[h.batter];
      say(s, 'The Hollow breaks the ward on the stair.', 'bad', true);
      h.batter = null;
      h.replan = 0;
      for (const c of n.foes) c.replan = 0;
    }
    return;
  }
  advance(h, T.hollowSpeed, Math.round(T.creeperClimb * 2 * TICKS_PER_SEC));
  if (h.climb || h.f !== VEIL_FLOOR) return;
  const m = MAP.mirrors.find((x) => Math.abs(x.x - h.x) < 2);
  if (m) cross(s, h, m, T.hollowCracks);
}

function cross(s, c, m, cracks) {
  const n = s.night;
  n.foes = n.foes.filter((x) => x !== c);
  s.cracks += cracks;
  n.stats.crossed++;
  n.stats.cracks += cracks;
  const where = TWINS[roomAt(VEIL_FLOOR, m.x)].name;
  if (c.type === 'hollow') {
    n.stats.hollow = 'crossed';
    say(s, `The Hollow reached the mirror in the ${where} and tore through the Veil: ${cracks} cracks.`, 'bad', true);
    if (s.cracks < s.tuning.cracksMax && s.living.length) takeLiving(s, pick(s, s.living));
  } else say(s, `A Creeper slipped through the Veil at the mirror in the ${where}. The Veil cracks: ${s.cracks} of ${s.tuning.cracksMax}.`, 'bad', true);
  if (s.phase === 'night' && s.cracks >= s.tuning.cracksMax) lose(s, 'veil', 'The Veil has broken. The Unlit are loose in the keep above.');
}

// The Hollow, loose above the Veil, takes one of the living. No body is left to wake.
function takeLiving(s, p) {
  s.living.splice(s.living.indexOf(p), 1);
  s.today.deaths.push(p.id);
  s.ledger.push({ id: p.id, name: p.name, from: 'living', season: s.season, day: s.day, cause: 'hollow', how: CAUSES.hollow.text, kind: null, guided: false, job: p.job, woke: 'taken', end: 'taken', endDay: s.day, nights: 0 });
  s.night.stats.taken = p.name;
  const q = p.bond ? byId(s.living, p.bond.with) : null;
  if (q) {
    q.grief = { for: p.id, mult: s.tuning.griefMult };
    q.peace = 0;
  }
  say(s, `It came up into the keep and took ${p.name} from their bed. There is no body to wake.${q ? ` ${q.name} grieves.` : ''}`, 'death', true);
  if (!s.living.length) lose(s, 'fallen', 'No one living is left. The keep has fallen.');
}

function foeDown(s, f) {
  const n = s.night;
  n.stats.killed++;
  const d = f.grab && byId(s.shades, f.grab);
  if (d && d.grabbedBy === f.id) d.grabbedBy = null;
  if (f.type === 'wraith' && f.shade) {
    const w = byId(s.shades, f.shade);
    if (w) {
      s.shades.splice(s.shades.indexOf(w), 1);
      endLedger(s, w.id, 'banished');
      restFor(s, w.id, false);
      say(s, `${w.name}'s Wraith is cut down and sinks into the Deep for good.`, 'good', true);
    }
  }
  if (f.type === 'hollow') {
    n.stats.hollow = 'driven back';
    gain(s, 'remembrance', s.tuning.hollowReward);
    say(s, `The Hollow is driven back into the Deep. The keep will tell of it: +${s.tuning.hollowReward} remembrance.`, 'good', true);
  }
}

function fadeAway(s, d, text) {
  s.shades = s.shades.filter((x) => x !== d);
  for (const c of s.night?.foes || []) {
    if (c.grab === d.id) c.grab = null;
    if (c.prey === d.id) c.prey = null;
  }
  s.night?.stats.lost.push(d.name);
  endLedger(s, d.id, 'faded');
  restFor(s, d.id, false);
  say(s, text, 'death', true);
}

/* ---------------------------------------------------------------- dawn */

function endNight(s) {
  const T = s.tuning;
  const n = s.night;
  const N = nightTicks(s);
  if (n.stats.hollow === 'rose') n.stats.hollow = 'withdrew';
  const withdrew = n.foes.filter((f) => f.type !== 'wraith').length;
  n.foes = [];
  n.candles = [];
  const wick = Math.floor(n.stats.wick + EPS);
  if (wick) s.res.candles += wick;
  const g = Math.floor(n.stats.guidance + EPS);
  if (g) s.guidance = Math.min(T.guidanceMax, s.guidance + g);
  let watch = 0;
  let calm = 0;
  for (const d of s.shades) {
    if (!canWork(d)) continue;
    watch += KINDS[d.kind].fight * perf(d) * DAY_ROOMS.barracks.rate * (d.watch / N);
    if (d.sang >= N / 2) calm++;
  }
  s.watchBonus = r1(watch);
  // The Restless: calmed by the Choir, or a night closer to turning Wraith.
  for (const d of s.shades.filter((x) => x.kind === 'restless').sort((a, b) => b.restless - a.restless)) {
    if (calm > 0) {
      calm--;
      continue;
    }
    d.restless++;
    if (d.restless >= T.restlessNights) {
      d.kind = 'wraith';
      d.trueKind = null;
      const e = ledgerOf(s, d.id);
      if (e) e.turned = s.day;
      say(s, `${d.name} has turned Wraith.`, 'bad', true);
    }
  }
  // Fading.
  const fading = [];
  for (const d of [...s.shades]) {
    if (!canWork(d)) continue;
    const rested = d.rest >= T.restShare * N;
    const loss = T.fadePerNight * (d.named ? 0.5 : 1) * (rested ? 0.5 : 1);
    d.memory = Math.round((d.memory - loss) * 100) / 100;
    d.nights++;
    const e = ledgerOf(s, d.id);
    if (e) e.nights = d.nights;
    fading.push({ id: d.id, name: d.name, fade: loss, drained: Math.round(d.drained * 10) / 10, rested, memory: d.memory });
    if (d.memory <= 0) fadeAway(s, d, `${d.name} has faded. Nothing is left in the glass.`);
  }
  s.today.night = { ...n.stats, fading, withdrew, wick, guidance: g, watch: s.watchBonus };
  const cracks = n.stats.cracks;
  s.night = null;
  if (s.cracks > 0) s.cracks--;
  if (s.phase === 'over') return;
  if (isNewMoon(s)) {
    endSeason(s, cracks);
    return;
  }
  toRite(s, cracks);
}

const defaultChoice = (d) => (d.kind === 'restless' ? 'release' : d.kind === 'wraith' ? 'leave' : 'keep');
export function choicesFor(d) {
  if (d.kind === 'wraith') return ['banish', 'leave'];
  if (d.kind === 'restless') return d.trueKind ? ['release', 'leave', 'bind'] : ['release', 'leave'];
  return ['keep', 'cover'];
}

function toRite(s, cracks) {
  s.phase = 'dawn';
  s.t = 0;
  s.rite = { choice: Object.fromEntries(s.shades.map((d) => [d.id, defaultChoice(d)])), vigils: 0, cracks };
  say(s, 'Dawn. The Unlit withdraw and the shades go back into the glass. Decide who stays.', 'rite', true);
}

export function ritePreview(s) {
  const R = s.rite;
  if (!R) return null;
  const T = s.tuning;
  const P = { keep: [], cover: [], release: [], leave: [], bind: [], banish: [], peace: [], rem: 0, essence: 0, errors: [] };
  let keepD = 0;
  let restD = 0;
  let wraithD = 0;
  for (const d of s.shades) {
    const c = R.choice[d.id] ?? defaultChoice(d);
    if (d.kind === 'wraith') {
      if (c === 'banish') {
        P.banish.push(d);
        P.essence += T.banishCost;
      } else {
        P.leave.push(d);
        wraithD += T.dreadPerWraith;
      }
    } else if (d.kind === 'restless') {
      if (c === 'release') {
        P.release.push(d);
        P.rem += 1;
      } else if (c === 'bind') {
        P.bind.push(d);
        P.essence += T.bindCost;
        keepD += T.dreadPerKeep;
      } else {
        P.leave.push(d);
        restD += T.dreadPerRestless;
      }
    } else if (c === 'cover') {
      P.cover.push(d);
      P.rem += 1;
    } else {
      P.keep.push(d);
      keepD += T.dreadPerKeep;
    }
  }
  for (const d of [...P.cover, ...P.release]) for (const p of s.living) if (p.grief?.for === d.id) P.peace.push(p);
  const free = capacity(s).free + P.cover.length;
  if (P.bind.length > free) P.errors.push(`Only ${free} mirror ${free === 1 ? 'space is' : 'spaces are'} free to bind into.`);
  const crackD = (R.cracks || 0) * T.dreadPerCrack;
  const bears = bear(s);
  const delta = keepD + restD + wraithD + crackD - bears - R.vigils;
  P.dread = { from: s.dread, keep: keepD, restless: restD, wraith: wraithD, cracks: crackD, bear: bears, vigils: R.vigils, delta, to: clamp(s.dread + delta, 0, T.dreadMax) };
  P.inspector = P.dread.to >= T.dreadMax;
  P.remCost = R.vigils * T.vigilCost;
  if (P.remCost > s.res.remembrance + P.rem + EPS) P.errors.push('Not enough remembrance for that many vigils.');
  if (P.essence > s.res.essence + EPS) P.errors.push(`Not enough essence (${fmt(P.essence)} needed).`);
  P.tonight = P.keep.length + P.bind.length;
  return P;
}

function release(s, d, how, text) {
  s.shades.splice(s.shades.indexOf(d), 1);
  endLedger(s, d.id, how);
  say(s, text, 'rest');
  restFor(s, d.id, true);
}

function beginDay(s) {
  const P = ritePreview(s);
  if (P.errors.length) return P.errors[0];
  const T = s.tuning;
  for (const d of P.cover) {
    const m = byId(s.mirrors, d.mirror);
    release(s, d, 'covered', `The ${m ? m.name : 'mirror'} is covered. ${d.name} is released.`);
  }
  for (const d of P.release) release(s, d, 'released', `${d.name} is released from the edge of the Deep.`);
  for (const d of P.banish) {
    s.shades.splice(s.shades.indexOf(d), 1);
    endLedger(s, d.id, 'banished');
    restFor(s, d.id, false);
    say(s, `${d.name} is banished into the Deep.`);
  }
  for (const d of P.bind) {
    const m = freeMirror(s);
    Object.assign(d, { mirror: m.id, kind: d.trueKind, trueKind: null, restless: 0, post: wakingSpot(s) });
    say(s, `${d.name} is bound to the ${m.name} and settles as ${KINDS[d.kind].name}.`, 'wake');
  }
  s.res.essence = Math.max(0, s.res.essence - P.essence);
  gain(s, 'remembrance', P.rem);
  s.res.remembrance = Math.max(0, s.res.remembrance - P.remCost);
  if (P.dread.to !== s.dread) say(s, `Dread ${P.dread.from} → ${P.dread.to}.`, P.dread.to > s.dread ? 'bad' : 'good');
  s.dread = P.dread.to;
  for (const d of s.shades) d.rites = (d.rites || 0) + 1;
  s.rite = null;
  s.days.push({ season: s.season, day: s.day, ...s.today, dread: s.dread, living: s.living.length, shades: s.shades.length });
  s.today = blankToday();
  s.day++;
  s.phase = 'day';
  s.t = 0;
  if (s.dread >= T.dreadMax && (!s.inspection || s.inspection.done)) {
    s.inspection = { day: s.day, reason: 'dread', done: false };
    say(s, 'Dread has reached its height. The Lantern Church sends an inspector; it arrives at noon.', 'bad', true);
  } else if (s.day === T.firstInspection - 1 && (!s.inspection || s.inspection.done)) {
    s.inspection = { day: T.firstInspection, reason: 'season', done: false };
    say(s, 'Word comes from the Lantern Church: an inspector will visit tomorrow at noon and judge how the keep keeps its dead.', 'rite', true);
  }
  if (s.day % T.newcomerEvery === 0 && s.living.length < T.maxLiving) newcomer(s);
  rollDay(s);
  say(s, `Season ${s.season}, day ${s.day}${isNewMoon(s) ? ': tonight is the new moon' : ''}.`, 'day');
  return null;
}

function newcomer(s) {
  const p = newPerson(s, freshName(s, NAMES), pick(s, ['young', 'adult', 'adult', 'old']));
  s.living.push(p);
  s.today.arrivals.push(p.id);
  say(s, `${p.name} (${p.age}) arrives at the gate and asks to stay. Assign a job.`, 'good', true);
}

/* ---------------------------------------------------------------- the season */

export function seasonSummary(s) {
  const ours = s.ledger.filter((e) => e.from === 'living' && e.season === s.season);
  const days = s.days.filter((d) => d.season === s.season);
  const nights = [...days.map((d) => d.night), s.today.night || s.night?.stats].filter(Boolean);
  return {
    season: s.season,
    living: s.living.length,
    shades: s.shades.filter(canWork).length,
    deaths: ours.length,
    byCause: Object.fromEntries(Object.keys(CAUSES).map((k) => [k, ours.filter((e) => e.cause === k).length])),
    raids: [...days.map((d) => d.raid), s.today.raid].filter(Boolean),
    inspections: s.inspections.filter((i) => i.season === s.season),
    cracks: nights.reduce((a, x) => a + x.cracks, 0),
    lost: nights.flatMap((x) => x.lost),
    hollow: (s.today.night || s.night?.stats)?.hollow || null,
    taken: nights.map((x) => x.taken).filter(Boolean),
    dread: s.dread,
  };
}

// One record per season played, won or lost, with the playtest answer once it's given.
function closeSeason(s, cracks, lost = null) {
  s.seasons.push({ season: s.season, day: s.day, lost, cracks, answer: null, note: '', summary: seasonSummary(s) });
}
export const lastSeason = (s) => s.seasons[s.seasons.length - 1] || null;

function endSeason(s, cracks) {
  s.phase = 'end';
  s.t = 0;
  closeSeason(s, cracks);
  say(s, `The new moon has passed. Season ${s.season} is over.`, 'rite', true);
}

function nextSeason(s) {
  const { cracks } = lastSeason(s);
  s.days.push({ season: s.season, day: s.day, ...s.today, dread: s.dread, living: s.living.length, shades: s.shades.length });
  s.today = blankToday();
  s.season++;
  s.day = 0;
  s.inspection = null;
  toRite(s, cracks);
  say(s, `Season ${s.season} begins with the dawn. The Host will come harder, and so will the Unlit.`, 'rite', true);
}

/* ---------------------------------------------------------------- player actions */

const onFloor = (f, x) => Number.isInteger(f) && f >= 0 && f < MAP.floors.length && Number.isFinite(x) && x >= MAP.LEFT && x <= MAP.RIGHT;

const ACTIONS = {
  assign(s, { id, room }) {
    const p = byId(s.living, id);
    if (!p) return 'No one living by that name.';
    if (room !== null && !(DAY_ROOMS[room] && DAY_ROOMS[room].out)) return 'No one works there.';
    p.job = room;
  },
  build(s, { mirror }) {
    const M = MIRRORS[mirror];
    if (!M) return 'No such mirror.';
    if (s.res.glass + EPS < M.glass) return `A ${M.name} needs ${M.glass} glass.`;
    s.res.glass = Math.max(0, s.res.glass - M.glass);
    const m = addMirror(s, mirror, nextPlace(s));
    say(s, `The ${m.name} is finished: room for ${M.cap} more ${M.cap === 1 ? 'shade' : 'shades'}.`, 'good');
  },
  wardGate(s) {
    const r = s.raid;
    if (s.phase !== 'day' || !r || r.state !== 'coming' || !r.warned) return 'No raid to ward against.';
    if (r.ward) return 'The gate is already warded.';
    if (s.res.essence + EPS < s.tuning.wardGateCost) return `A ward costs ${s.tuning.wardGateCost} essence.`;
    s.res.essence -= s.tuning.wardGateCost;
    r.ward = s.tuning.wardGateDefense;
    say(s, `The gate is warded with essence: defense +${r.ward}.`, 'good');
  },
  // A vigil by day lowers Dread straight away; at dawn, vigils count in the rite's reckoning.
  vigil(s) {
    if (s.phase !== 'day') return 'Vigils by day lower Dread at once. At dawn, set them in the rite.';
    if (s.dread <= 0) return 'There is no Dread to ease.';
    if (s.res.remembrance + EPS < s.tuning.vigilCost) return `A vigil costs ${s.tuning.vigilCost} remembrance.`;
    s.res.remembrance -= s.tuning.vigilCost;
    s.dread--;
    say(s, `A vigil in the Chapel eases the keep. Dread ${s.dread + 1} → ${s.dread}.`, 'good');
  },
  vigils(s, { n }) {
    if (s.phase !== 'dawn') return 'The rite is at dawn.';
    s.rite.vigils = clamp(Math.floor(n) || 0, 0, 10);
  },
  funeral(s, { id, on }) {
    if (s.phase === 'dusk' && s.dusk.step !== 'crypt') return 'The dead have already woken.';
    const b = byId(s.bodies, id);
    if (!b) return 'No such body.';
    if (on && !b.funeral) {
      const cap = funeralCap(s);
      if (!cap) return 'Funerals need a priest in the Chapel.';
      if (s.bodies.filter((x) => x.funeral).length >= cap) return `Each priest holds one funeral a day. You have ${cap}.`;
    }
    b.funeral = !!on;
  },
  wake(s) {
    if (s.phase !== 'dusk' || s.dusk.step !== 'crypt') return 'The dead wake at dusk.';
    for (const x of crossingPreview(s)) {
      if (x.to === 'funeral') bury(s, x.b);
      else rise(s, x.b, x);
    }
    s.bodies = [];
    s.dusk.step = 'place';
  },
  candle(s, { f, x }) {
    if (!(s.phase === 'night' || (s.phase === 'dusk' && s.dusk.step === 'place'))) return 'Candles are set at dusk, once the dead have woken, or during the night.';
    if (!onFloor(f, x)) return 'That is not a place in the Tain.';
    if (!roomAt(f, x)) return 'That is inside a wall.';
    if (s.res.candles < 1) return 'No candles left. The Chandlery makes them by day.';
    s.res.candles--;
    s.night.candles.push({ id: 'k' + s.nextId++, f, x, wax: s.tuning.candleWax, max: s.tuning.candleWax });
    s.night.stats.candles++;
  },
  move(s, { id, f, x }) {
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!canWork(d)) return `${d.name} can't be posted.`;
    if (!onFloor(f, x) || !roomAt(f, x)) return 'That is not a place in the Tain.';
    if (s.phase === 'dusk' || s.phase === 'dawn' || s.phase === 'day') {
      Object.assign(d, { post: { f, x }, f, x, ox: x, of: f, path: [], climb: 0 });
      return undefined;
    }
    if (s.phase !== 'night') return 'Not now.';
    if (d.grabbedBy) return `${d.name} is held. Light the spot to free it.`;
    if (d.climb) return `${d.name} is on the stairs.`;
    const r = route(lightMap(s.tuning, s.night.candles), d, [{ f, x }]);
    if (!r) return 'No way there.';
    d.path = r.path;
    d.post = { f, x };
  },
  ward(s, { target }) {
    if (s.phase !== 'night' && s.phase !== 'dusk') return 'Wards are set at dusk or during the night.';
    if (!MAP.stairs.some((x) => x.id === target) && !MAP.rifts.some((x) => x.id === target)) return 'Wards seal a stair or a rift.';
    if (s.night.wards.includes(target)) return 'Already warded tonight.';
    if (s.res.essence + EPS < s.tuning.wardCost) return `A ward costs ${s.tuning.wardCost} essence.`;
    s.res.essence -= s.tuning.wardCost;
    s.night.wards.push(target);
    if (MAP.stairs.some((x) => x.id === target)) s.night.wardHold[target] = s.tuning.wardHold;
    s.night.stats.wards++;
    for (const c of s.night.foes) c.replan = 0;
  },
  hush(s, { on }) {
    if (s.phase !== 'night') return 'Hush is for the night.';
    s.night.hush = !!on;
    say(s, on ? 'Hush. The shades go silent; the Unlit pass them by, and all work stops.' : 'The hush ends.', on ? 'night' : '');
  },
  startNight(s) {
    if (s.phase !== 'dusk') return 'The night begins at dusk.';
    if (s.dusk.step !== 'place') return 'Let the dead wake first.';
    startNight(s);
  },
  rite(s, { id, choice }) {
    if (s.phase !== 'dawn') return 'The rite is at dawn.';
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!choicesFor(d).includes(choice)) return 'Not a choice for this shade.';
    s.rite.choice[id] = choice;
  },
  name(s, { id }) {
    if (s.phase !== 'dawn') return 'The dead are named at dawn.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'No such shade in the glass.';
    if (d.named) return `${d.name} is already in the ledger.`;
    if (s.res.remembrance + EPS < s.tuning.nameCost) return `Naming costs ${s.tuning.nameCost} remembrance.`;
    s.res.remembrance -= s.tuning.nameCost;
    d.named = true;
    say(s, `${d.name} is written in the ledger and will fade half as fast.`, 'good');
  },
  remember(s, { id }) {
    if (s.phase !== 'dawn') return 'Remembrance is spent at dawn.';
    const d = byId(s.shades, id);
    if (!d || !canWork(d)) return 'No such shade in the glass.';
    if (d.memory >= 100) return `${d.name} remembers everything.`;
    if (s.res.remembrance + EPS < s.tuning.rememberCost) return `Remembering costs ${s.tuning.rememberCost} remembrance.`;
    s.res.remembrance -= s.tuning.rememberCost;
    d.memory = Math.min(100, d.memory + s.tuning.rememberGain);
  },
  beginDay(s) {
    if (s.phase !== 'dawn') return 'The day begins after the rite.';
    return beginDay(s);
  },
  // The weeks 7–10 test: would you play a second season?
  answer(s, { answer, note }) {
    const e = lastSeason(s);
    if (!e || (s.phase !== 'end' && s.phase !== 'over')) return 'The season is not over.';
    if (answer !== null && answer !== 'again' && answer !== 'stop') return 'Answer again or stop.';
    e.answer = answer;
    if (typeof note === 'string') e.note = note.slice(0, 2000);
  },
  nextSeason(s) {
    if (s.phase !== 'end') return 'The season is not over.';
    nextSeason(s);
  },
  tune(s, { key, value }) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return 'Needs a number.';
    if (typeof s.tuning[key] !== 'number') return 'No such setting.';
    if ((key === 'daySecs' || key === 'nightSecs') && v < 10) return 'At least 10 seconds.';
    s.tuning[key] = v;
  },
  debug(s, a) {
    if (a.what === 'give') {
      if (!(a.res in s.res)) return 'No such resource.';
      s.res[a.res] += Number(a.n) || 0;
      return undefined;
    }
    if (a.what === 'kill') {
      const p = byId(s.living, a.id);
      if (!p) return 'No one living by that name.';
      if (!CAUSES[a.cause] || !CAUSES[a.cause].kind || a.cause === 'raider') return 'No such cause.';
      kill(s, p, a.cause, a.cause === 'yours' ? 'was put to death on your order' : undefined);
      return undefined;
    }
    if (a.what === 'dread') {
      s.dread = clamp(Number(a.n) || 0, 0, s.tuning.dreadMax);
      return undefined;
    }
    if (a.what === 'skip') {
      if (s.phase === 'day') s.t = dayTicks(s) - 1;
      else if (s.phase === 'night') s.t = nightTicks(s) - 1;
      else return 'Nothing to skip.';
      return undefined;
    }
    return 'Unknown debug action.';
  },
};

export function act(s, a) {
  if (s.phase === 'over' && a.type !== 'answer') return { ok: false, error: 'This keep is lost. Start a new season.' };
  const f = ACTIONS[a.type];
  if (!f) return { ok: false, error: `Unknown action: ${a.type}` };
  const at = { season: s.season, day: s.day, phase: s.phase, t: s.t };
  const error = f(s, a);
  if (error) return { ok: false, error };
  s.actions.push({ a, at });
  s.rev++;
  return { ok: true };
}

export function replay(seed, tuning, actions) {
  const s = newSeason(seed, tuning);
  for (const { a, at } of actions) {
    let guard = 1e7;
    while (!(s.season === at.season && s.day === at.day && s.phase === at.phase && s.t === at.t)) {
      if (s.phase !== 'day' && s.phase !== 'night') throw new Error(`Replay stuck: season ${s.season} day ${s.day} ${s.phase}, waiting for ${JSON.stringify(at)}`);
      if (!guard--) throw new Error('Replay ran away');
      step(s);
    }
    const r = act(s, a);
    if (!r.ok) throw new Error(`Replay action ${a.type} failed: ${r.error}`);
  }
  return s;
}
