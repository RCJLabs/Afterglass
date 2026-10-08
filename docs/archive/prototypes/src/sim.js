// Afterglass greybox simulation. Pure and deterministic: no DOM, no clock, no Math.random.
// The whole game state is one plain JSON object. step() advances one fixed tick; act() applies a
// player action and records it, so replay(seed, tuning, actions) rebuilds any session exactly.

import {
  TICKS_PER_SEC, TUNING, DAY_ROOMS, NIGHT_ROOMS, CAUSES, GUIDE_UP, KINDS, WORKING_KINDS, TRAITS, TRAIT_IDS,
  SHADE_TRAITS, MIRRORS, MIRROR_PLACES, START_CAST, START_BONDS, START_MIRRORS, NAMES, RAIDER_NAMES,
} from './data.js';
import { rand, randInt, pick, chance, pickWeighted } from './rng.js';

export const SAVE_VERSION = 1;
export const FEELS = ['loss', 'hire', 'both', 'neither'];

const EPS = 1e-9;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = (x) => Math.round(x * 100) / 100;
export const fmt = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
const listNames = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const dayTicks = (s) => Math.round(s.tuning.daySecs * TICKS_PER_SEC);
export const nightTicks = (s) => Math.round(s.tuning.nightSecs * TICKS_PER_SEC);
export const byId = (list, id) => list.find((x) => x.id === id);
export const ledgerOf = (s, id) => s.ledger.find((e) => e.id === id);

/* ---------------------------------------------------------------- setup */

export function newGame(seed = Date.now() >>> 0, overrides = {}) {
  const tuning = { ...TUNING, ...overrides, dread: { ...TUNING.dread, ...(overrides.dread || {}) } };
  const s = {
    v: SAVE_VERSION,
    seed: seed >>> 0,
    rng: seed >>> 0,
    tuning,
    tuning0: JSON.parse(JSON.stringify(tuning)), // as started, for replays; 'tune' actions change tuning
    day: 1,
    phase: 'day', // day → dusk (paused) → night → rite (paused) → day …, or 'fallen'
    t: 0, // ticks into the current phase
    rev: 0, // bumped on every structural change so the UI knows when to redraw
    res: { food: tuning.startFood, glass: tuning.startGlass, essence: 0, remembrance: 0 },
    dread: 0,
    living: [],
    bodies: [],
    shades: [],
    mirrors: [],
    raid: null,
    events: [],
    nextRaid: tuning.raidFirstDay,
    heal: 0,
    hungry: false,
    starve: 0,
    guidance: 0,
    guideProg: 0,
    watchBonus: 0, // Watch strength left over after holding Wraiths: tomorrow's extra defense
    haunt: { day: [], night: [] },
    dusk: null,
    rite: null,
    nextId: 1,
    used: [],
    log: [],
    alerts: [],
    ledger: [],
    days: [],
    actions: [],
    today: blankToday(),
  };
  const cast = {};
  for (const c of START_CAST) {
    const p = newPerson(s, c.name, c.trait, c.age, c.job);
    s.living.push(p);
    cast[c.name] = p;
  }
  for (const [a, b, rel] of START_BONDS) bond(cast[a], cast[b], rel);
  for (const [type, place] of START_MIRRORS) addMirror(s, type, place);
  rollDay(s);
  say(s, 'Day 1. You hold a keep on the Veil. Anyone who dies inside the walls wakes at dusk as a shade.', 'day');
  return s;
}

function blankToday() {
  return { made: {}, deaths: [], arrivals: [] };
}

function newPerson(s, name, trait, age, job = null) {
  if (!s.used.includes(name)) s.used.push(name);
  return { id: 'p' + s.nextId++, name, trait, age, job, bond: null, sick: 0, grief: null, peace: 0, joined: s.day };
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
  s.log.push({ day: s.day, phase: s.phase, t: s.t, text, tone });
  if (s.log.length > 600) s.log.splice(0, s.log.length - 600);
  if (alert) s.alerts.push({ text, tone });
  s.rev++;
}

function gain(s, res, n) {
  s.res[res] += n;
  s.today.made[res] = (s.today.made[res] || 0) + n;
}

/* ---------------------------------------------------------------- derived values */

const tmult = (table, room) => (table ? table[room] ?? table['*'] ?? 1 : 1);

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

function freeMirror(s) {
  return s.mirrors.find((m) => mirrorUse(s, m) < mirrorCap(m)) || null;
}

export const canWork = (d) => !!d.mirror && WORKING_KINDS.includes(d.kind);

export function griefMult(s, p) {
  if (!p.grief) return 1;
  const d = byId(s.shades, p.grief.for);
  if (d && d.mirror && SHADE_TRAITS[d.trait]?.soothes) return 1;
  return p.grief.mult;
}

export const bondedShade = (s, p) => (p.bond ? byId(s.shades, p.bond.with) : null);

// A living worker and their bonded shade in the day/night twins of the same room pair.
export function isTwinnedLiving(s, p) {
  const d = bondedShade(s, p);
  return !!(d && p.job && canWork(d) && d.post === DAY_ROOMS[p.job].twin);
}

export function isTwinnedShade(s, d) {
  if (!d.bond || !d.post || !canWork(d)) return false;
  const p = byId(s.living, d.bond.with);
  return !!(p && p.job && DAY_ROOMS[p.job].twin === d.post);
}

function wailOver(s, room) {
  const twin = DAY_ROOMS[room].twin;
  const d = s.shades.find((x) => x.post === twin && canWork(x) && SHADE_TRAITS[x.trait]?.wail);
  return d ? SHADE_TRAITS[d.trait].wail : 1;
}

export function livingMult(s, p) {
  if (!p.job) return 0;
  const T = s.tuning;
  let m = tmult(TRAITS[p.trait].day, p.job);
  if (p.sick > 0) m *= T.sickMult;
  if (s.hungry) m *= T.hungryMult;
  m *= griefMult(s, p);
  if (p.peace > 0) m *= T.peaceMult;
  if (isTwinnedLiving(s, p)) m *= T.twinMult;
  if (s.haunt.day.includes(p.job)) m *= T.hauntMult;
  m *= wailOver(s, p.job);
  return m;
}

export function shadeMult(s, d, room = d.post) {
  if (!room || !canWork(d) || !NIGHT_ROOMS[room]?.out) return 0;
  const st = SHADE_TRAITS[d.trait] || {};
  if (s.haunt.night.includes(room) && !st.hauntImmune) return 0;
  const k = KINDS[d.kind];
  let m = k.mult * (k.best === room ? k.bestMult : 1) * tmult(st.night, room);
  if (isTwinnedShade(s, d)) m *= s.tuning.twinMult;
  return m;
}

export function roomPower(s, side) {
  const out = {};
  if (side === 'day') {
    for (const r in DAY_ROOMS) out[r] = 0;
    for (const p of s.living) if (p.job) out[p.job] += livingMult(s, p);
  } else {
    for (const r in NIGHT_ROOMS) out[r] = 0;
    for (const d of s.shades) if (d.post && canWork(d)) out[d.post] += shadeMult(s, d);
  }
  return out;
}

export const defense = (s) => roomPower(s, 'day').barracks * DAY_ROOMS.barracks.rate + (s.raid?.ward || 0) + (s.watchBonus || 0);
export const priests = (s) => s.living.filter((p) => p.job === 'chapel').length;
export const funeralCap = priests;
export const eatRate = (s) => s.living.reduce((a, p) => a + (TRAITS[p.trait].eats ?? 1), 0) * s.tuning.eatPerDay;

// How many of the dead the living can bear each dawn before Dread rises.
export const bear = (s) => Math.floor(s.living.length / s.tuning.dread.livingPer) + priests(s);

/* ---------------------------------------------------------------- the clock */

export function step(s) {
  if (s.phase === 'day') dayTick(s);
  else if (s.phase === 'night') nightTick(s);
}

function dayTick(s) {
  const D = dayTicks(s);
  s.t++;
  const pw = roomPower(s, 'day');
  gain(s, 'food', (pw.hearth * DAY_ROOMS.hearth.rate) / D);
  gain(s, 'glass', (pw.glazier * DAY_ROOMS.glazier.rate) / D);
  gain(s, 'remembrance', (pw.chapel * DAY_ROOMS.chapel.rate) / D);
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
    s.heal = 0; // healing can't be banked
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
    const v = weakest(s);
    if (v) kill(s, v, 'neglect');
  }
}

function weakest(s) {
  const score = (p) => (p.sick > 0 ? 0 : 10) + (p.age === 'old' ? 0 : p.age === 'young' ? 2 : 4);
  return [...s.living].sort((a, b) => score(a) - score(b))[0] || null;
}

function rollDay(s) {
  const T = s.tuning;
  const D = dayTicks(s);
  s.events = [];
  s.raid = null;
  if (s.day >= s.nextRaid) {
    s.raid = newRaid(s, Math.round(T.raidWarnAt * D), Math.round(T.raidHitAt * D));
    s.nextRaid = s.day + T.raidGap[0] + randInt(s, T.raidGap[1] - T.raidGap[0] + 1);
  }
  if (chance(s, T.sickChance)) s.events.push({ at: Math.round((0.1 + rand(s) * 0.5) * D), type: 'sick' });
  for (const p of s.living) {
    if (p.age === 'old' && chance(s, T.oldAgeChance)) {
      s.events.push({ at: Math.round((0.15 + rand(s) * 0.8) * D), type: 'oldage', id: p.id });
    }
  }
  s.events.sort((a, b) => a.at - b.at);
}

function newRaid(s, warnAt, hitAt) {
  const T = s.tuning;
  const strength = Math.round((T.raidBase + T.raidPerDay * s.day + rand(s) * T.raidSpread) * 10) / 10;
  const raid = { strength, count: Math.max(2, Math.round(strength / 2)), ward: 0, state: 'coming', warned: false, warnAt, hitAt };
  s.events.push({ at: warnAt, type: 'raidWarn' }, { at: hitAt, type: 'raidHit' });
  s.events.sort((a, b) => a.at - b.at);
  return raid;
}

function fire(s, e) {
  if (e.type === 'sick') {
    const well = s.living.filter((p) => !(p.sick > 0));
    if (!well.length) return;
    const p = pickWeighted(s, well, (q) => TRAITS[q.trait].sickRisk ?? 1);
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
    const risk = clamp((held ? T.raidRiskHeld : T.raidRiskBreach) * ratio * (TRAITS[g.trait].raidRisk ?? 1), 0.02, T.raidRiskMax);
    if (chance(s, risk)) fallen.push({ p: g, how: 'died holding the gate' });
  }
  // Only the dead inside the walls wake. At a held gate the raiders fall outside, except the odd one
  // who makes it into the gatehouse; after a breach the ones cut down inside are yours.
  const raiders = held ? (chance(s, s.tuning.raidInsideHeld) ? 1 : 0) : 1 + randInt(s, Math.ceil(r.count / 2));
  let loot = '';
  if (!held) {
    const civ = s.living.filter((p) => p.job !== 'barracks');
    if (civ.length) fallen.push({ p: pick(s, civ), how: 'was cut down in the yard' });
    const food = Math.floor(s.res.food * T.raidLoot);
    const glass = Math.floor(s.res.glass * T.raidLoot);
    s.res.food -= food;
    s.res.glass -= glass;
    loot = ` They carried off ${food} food and ${glass} glass.`;
  }
  r.state = held ? 'held' : 'breached';
  say(
    s,
    held
      ? `The gate held against ${r.count} raiders (defense ${fmt(def)} against strength ${fmt(r.strength)}).`
      : `The raiders broke through (defense ${fmt(def)} against strength ${fmt(r.strength)}).${loot}`,
    held ? 'good' : 'bad',
    true,
  );
  for (const f of fallen) kill(s, f.p, 'duty', f.how);
  for (let i = 0; i < raiders; i++) raiderBody(s);
  if (raiders) {
    say(s, held
      ? 'One raider fell inside the gatehouse. The body lies in the crypt with your dead.'
      : `${raiders} raider${raiders === 1 ? ' was' : 's were'} cut down inside the walls. The bodies lie in the crypt with your dead.`);
  }
}

/* ---------------------------------------------------------------- death */

export function kill(s, p, cause, how) {
  const i = s.living.indexOf(p);
  if (i < 0) return null;
  const lost = p.job ? { room: p.job, out: DAY_ROOMS[p.job].out, perDay: r2(livingMult(s, p) * DAY_ROOMS[p.job].rate) } : null;
  s.living.splice(i, 1);
  let kind = CAUSES[cause].kind;
  let guided = false;
  if (s.guidance > 0 && GUIDE_UP[kind]) {
    kind = GUIDE_UP[kind];
    s.guidance--;
    guided = true;
  }
  const b = {
    id: p.id, name: p.name, trait: p.trait, age: p.age, job: p.job, bond: p.bond, cause, kind, guided,
    how: how || CAUSES[cause].text, day: s.day, funeral: false, from: 'living',
  };
  s.bodies.push(b);
  s.today.deaths.push(p.id);
  addLedger(s, b, lost);
  let grief = '';
  const q = p.bond ? byId(s.living, p.bond.with) : null;
  if (q) {
    q.grief = { for: p.id, mult: TRAITS[p.trait].bondGrief ?? s.tuning.griefMult };
    q.peace = 0;
    grief = ` ${q.name} grieves.`;
  }
  say(s, `${p.name} ${b.how}.${guided ? ' The Threshold eased the passing.' : ''}${grief}`, 'death', true);
  if (!s.living.length) {
    s.phase = 'fallen';
    say(s, 'No one living is left. The keep has fallen.', 'bad', true);
  }
  return b;
}

function raiderBody(s) {
  const b = {
    id: 'r' + s.nextId++, name: freshName(s, RAIDER_NAMES), trait: pick(s, TRAIT_IDS), age: 'adult', job: null,
    bond: null, cause: 'raider', kind: 'stranger', guided: false, how: CAUSES.raider.text, day: s.day,
    funeral: false, from: 'raider',
  };
  s.bodies.push(b);
  addLedger(s, b, null);
}

function addLedger(s, b, lost) {
  s.ledger.push({
    id: b.id, name: b.name, from: b.from, day: b.day, cause: b.cause, how: b.how, kind: b.kind, guided: b.guided,
    trait: b.trait, job: b.job, lost, bond: b.bond ? { id: b.bond.with, rel: b.bond.rel } : null,
    woke: null, mirror: null, nights: 0, made: {}, turned: null, end: null, endDay: null, feel: null,
  });
}

function endLedger(s, id, end) {
  const e = ledgerOf(s, id);
  if (e) {
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

/* ---------------------------------------------------------------- dusk: the Crossing */

function endDay(s) {
  s.phase = 'dusk';
  s.t = 0;
  s.events = [];
  s.haunt.day = [];
  s.watchBonus = 0;
  s.dusk = { step: s.bodies.length ? 'crypt' : 'posting' };
  const n = s.bodies.length;
  say(
    s,
    n
      ? `Dusk. ${n} ${n === 1 ? 'body lies' : 'bodies lie'} in the crypt. Hold funerals or let them wake.`
      : 'Dusk. The crypt is empty. Post the shades for the night.',
    'dusk',
    true,
  );
}

// What happens to each body if the dead wake now. Bodies are in the order they died.
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
  if (e) {
    e.woke = 'funeral';
    e.end = 'funeral';
    e.endDay = s.day;
  }
  say(s, b.from === 'raider' ? `${b.name} was burned with the Host's dead.` : `${b.name} was laid to rest.`, 'rest');
  restFor(s, b.id, true);
}

function rise(s, b, x) {
  const d = {
    id: b.id, name: b.name, kind: b.kind, trueKind: null, trait: TRAITS[b.trait].inv, was: b.trait, mirror: null,
    post: null, nights: 0, rites: 0, restless: 0, bond: b.bond, cause: b.cause, from: b.from, day: b.day, job: b.job,
  };
  let text;
  if (x.to === 'mirror') {
    d.mirror = x.mirror.id;
    // The dead go back to the rooms they knew: default post is the twin of their old job.
    const twin = b.job && DAY_ROOMS[b.job].twin;
    if (twin && NIGHT_ROOMS[twin].out) d.post = twin;
    text = `${b.name} wakes ${KINDS[d.kind].name} in the ${x.mirror.name}.`;
  } else if (x.to === 'overflow') {
    d.trueKind = d.kind;
    d.kind = 'restless';
    text = `${b.name} wakes Restless at the edge of the Deep. No mirror had room.`;
  } else if (x.to === 'restless') {
    text = `${b.name} wakes Restless at the edge of the Deep.`;
  } else {
    text = `${b.name} wakes as a Wraith.`;
  }
  const e = ledgerOf(s, b.id);
  if (e) {
    e.woke = x.to === 'overflow' ? 'overflow' : d.kind;
    e.mirror = x.mirror?.name || null;
  }
  s.shades.push(d);
  say(s, text, d.mirror ? 'wake' : 'bad');
}

/* ---------------------------------------------------------------- night */

function nightTick(s) {
  const N = nightTicks(s);
  s.t++;
  for (const d of s.shades) {
    if (!d.post || !canWork(d)) continue;
    const m = shadeMult(s, d);
    if (!m) continue;
    const R = NIGHT_ROOMS[d.post];
    const amount = (m * R.rate) / N;
    if (R.out === 'glass' || R.out === 'essence') gain(s, R.out, amount);
    else if (R.out === 'guidance') s.guideProg += amount;
    const e = ledgerOf(s, d.id);
    if (e) e.made[R.out] = (e.made[R.out] || 0) + amount;
  }
  if (s.t >= N) endNight(s);
}

function endNight(s) {
  const T = s.tuning;
  const g = Math.floor(s.guideProg + EPS);
  if (g > 0) {
    s.guideProg = Math.max(0, s.guideProg - g);
    const before = s.guidance;
    s.guidance = Math.min(T.guidanceMax, s.guidance + g);
    if (s.guidance > before) say(s, `The Threshold can guide ${s.guidance} ${s.guidance === 1 ? 'death' : 'deaths'} tomorrow.`, 'good');
  }
  let calm = s.shades.filter((d) => d.post === 'choir' && shadeMult(s, d) > 0).length;
  const restless = s.shades.filter((d) => d.kind === 'restless').sort((a, b) => b.restless - a.restless);
  for (const d of restless) {
    if (calm > 0) {
      calm--;
      say(s, `The Choir calms ${d.name} for the night.`, 'good');
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
  for (const d of s.shades) {
    d.nights++;
    const e = ledgerOf(s, d.id);
    if (e) e.nights = d.nights;
  }
  s.haunt.day = s.haunt.night.map((r) => NIGHT_ROOMS[r].twin);
  s.haunt.night = [];
  s.phase = 'rite';
  s.t = 0;
  s.rite = { choice: Object.fromEntries(s.shades.map((d) => [d.id, defaultChoice(d)])), vigils: 0 };
  say(s, 'Dawn. The shades go back into the glass. Decide who stays.', 'rite', true);
}

const defaultChoice = (d) => (d.kind === 'restless' ? 'release' : d.kind === 'wraith' ? 'leave' : 'keep');

export function choicesFor(d) {
  if (d.kind === 'wraith') return ['banish', 'leave'];
  if (d.kind === 'restless') return d.trueKind ? ['release', 'leave', 'bind'] : ['release', 'leave'];
  return ['keep', 'cover'];
}

/* ---------------------------------------------------------------- dawn: the Rite */

export function ritePreview(s) {
  const R = s.rite;
  if (!R) return null;
  const T = s.tuning;
  const DR = T.dread;
  const P = { keep: [], cover: [], release: [], leave: [], bind: [], banish: [], peace: [], rem: 0, essence: 0, errors: [] };
  let keepD = 0;
  let restD = 0;
  let wraithD = 0;
  const keepCost = (d) => DR.perKeep + (SHADE_TRAITS[d.trait]?.keepDread ?? 0);
  for (const d of s.shades) {
    const c = R.choice[d.id] ?? defaultChoice(d);
    if (d.kind === 'wraith') {
      if (c === 'banish') {
        P.banish.push(d);
        P.essence += T.banishCost;
      } else {
        P.leave.push(d);
        wraithD += DR.perWraith;
      }
    } else if (d.kind === 'restless') {
      if (c === 'release') {
        P.release.push(d);
        P.rem += 1;
      } else if (c === 'bind') {
        P.bind.push(d);
        P.essence += T.bindCost;
        keepD += keepCost(d);
      } else {
        P.leave.push(d);
        restD += DR.perRestless;
      }
    } else if (c === 'cover') {
      P.cover.push(d);
      P.rem += 1;
    } else {
      P.keep.push(d);
      keepD += keepCost(d);
    }
  }
  for (const d of [...P.cover, ...P.release]) for (const p of s.living) if (p.grief?.for === d.id) P.peace.push(p);
  const free = capacity(s).free + P.cover.length;
  if (P.bind.length > free) P.errors.push(`Only ${free} mirror ${free === 1 ? 'space is' : 'spaces are'} free to bind into.`);
  if (P.bind.some((d) => !d.trueKind)) P.errors.push('Only shades that woke Restless for want of a mirror can be bound.');
  const vig = R.vigils;
  const bears = bear(s);
  const delta = keepD + restD + wraithD - bears - vig;
  P.dread = { from: s.dread, keep: keepD, restless: restD, wraith: wraithD, bear: bears, vigils: vig, delta, to: clamp(s.dread + delta, 0, DR.max) };
  P.inspector = P.dread.to >= DR.inspectorAt;
  P.remCost = vig * T.vigilCost;
  if (P.remCost > s.res.remembrance + P.rem + EPS) P.errors.push('Not enough remembrance for that many vigils.');
  if (P.essence > s.res.essence + EPS) P.errors.push(`Not enough essence (${fmt(P.essence)} needed).`);
  P.tonight = P.keep.length + P.bind.length;
  return P;
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
    d.mirror = m.id;
    d.kind = d.trueKind;
    d.trueKind = null;
    d.restless = 0;
    const e = ledgerOf(s, d.id);
    if (e) e.mirror = m.name;
    say(s, `${d.name} is bound to the ${m.name} and settles as ${KINDS[d.kind].name}.`, 'wake');
  }
  s.res.essence = Math.max(0, s.res.essence - P.essence);
  gain(s, 'remembrance', P.rem);
  s.res.remembrance = Math.max(0, s.res.remembrance - P.remCost);
  if (P.dread.to !== s.dread) say(s, `Dread ${P.dread.from} → ${P.dread.to}.`, P.dread.to > s.dread ? 'bad' : 'good');
  s.dread = P.dread.to;
  for (const d of s.shades) d.rites++;
  s.rite = null;
  s.days.push({ day: s.day, ...s.today, dread: s.dread, living: s.living.length, shades: s.shades.length });
  s.today = blankToday();
  s.day++;
  s.phase = 'day';
  s.t = 0;
  if (s.dread >= T.dread.inspectorAt) inspect(s);
  if (s.day % T.newcomerEvery === 0 && s.living.length < T.maxLiving) newcomer(s);
  rollDay(s);
  say(s, `Day ${s.day}.`, 'day');
  return null;
}

function release(s, d, how, text) {
  s.shades.splice(s.shades.indexOf(d), 1);
  endLedger(s, d.id, how);
  say(s, text, 'rest');
  restFor(s, d.id, true);
}

// Placeholder until the Lantern Church arrives properly in weeks 7–10.
function inspect(s) {
  const groups = s.mirrors
    .map((m) => ({ m, ds: s.shades.filter((d) => d.mirror === m.id && !SHADE_TRAITS[d.trait]?.inspectorImmune) }))
    .filter((g) => g.ds.length)
    .sort((a, b) => b.ds.length - a.ds.length);
  const g = groups[0];
  if (g) {
    for (const d of g.ds) {
      s.shades.splice(s.shades.indexOf(d), 1);
      endLedger(s, d.id, 'taken');
      restFor(s, d.id, false);
    }
    say(s, `The Lantern Church sends an inspector, who covers the ${g.m.name} and takes ${listNames(g.ds.map((d) => d.name))}. Taken, not released: no one is at peace.`, 'bad', true);
  } else {
    say(s, 'The Lantern Church sends an inspector, who finds nothing to take this time.', 'bad', true);
  }
  s.dread = s.tuning.dread.afterInspector;
}

function newcomer(s) {
  const p = newPerson(s, freshName(s, NAMES), pick(s, TRAIT_IDS), pick(s, ['young', 'adult', 'adult', 'old']));
  s.living.push(p);
  s.today.arrivals.push(p.id);
  say(s, `${p.name} (${TRAITS[p.trait].name.toLowerCase()}, ${p.age}) arrives at the gate and asks to stay. Assign a job.`, 'good', true);
}

/* ---------------------------------------------------------------- player actions */

const ACTIONS = {
  assign(s, { id, room }) {
    const p = byId(s.living, id);
    if (!p) return 'No one living by that name.';
    if (room !== null && !DAY_ROOMS[room]) return 'No such room.';
    p.job = room;
  },
  post(s, { id, room }) {
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!canWork(d)) return `${d.name} can't work.`;
    if (room !== null && !NIGHT_ROOMS[room]?.out) return 'There is no night work there yet.';
    d.post = room;
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
    s.dusk.step = 'posting';
  },
  beginNight(s) {
    if (s.phase !== 'dusk') return 'Night follows dusk.';
    if (s.dusk.step !== 'posting') return 'Let the dead wake first.';
    s.phase = 'night';
    s.t = 0;
    s.dusk = null;
    s.haunt.night = [];
    let hold = roomPower(s, 'night').watch * NIGHT_ROOMS.watch.rate;
    for (const w of s.shades.filter((d) => d.kind === 'wraith')) {
      if (hold >= 1 - EPS) {
        hold -= 1;
        say(s, `The Watch holds ${w.name} at the edge of the Deep.`, 'good');
        continue;
      }
      const rooms = Object.keys(NIGHT_ROOMS).filter((r) => NIGHT_ROOMS[r].out);
      const staffed = rooms.filter((r) => s.shades.some((d) => d.post === r && canWork(d) && !SHADE_TRAITS[d.trait]?.hauntImmune));
      const r = pick(s, staffed.length ? staffed : rooms);
      if (!s.haunt.night.includes(r)) s.haunt.night.push(r);
      say(s, `${w.name} haunts the ${NIGHT_ROOMS[r].name}. No work there tonight, and the ${DAY_ROOMS[NIGHT_ROOMS[r].twin].name} works at half tomorrow.`, 'bad', true);
    }
    s.watchBonus = Math.max(0, hold);
    say(s, 'Night. The living sleep and the dead go to their posts.', 'night');
  },
  rite(s, { id, choice }) {
    if (s.phase !== 'rite') return 'The rite is at dawn.';
    const d = byId(s.shades, id);
    if (!d) return 'No such shade.';
    if (!choicesFor(d).includes(choice)) return 'Not a choice for this shade.';
    s.rite.choice[id] = choice;
  },
  vigil(s, { n }) {
    if (s.phase !== 'rite') return 'Vigils are held at dawn.';
    s.rite.vigils = clamp(Math.floor(n) || 0, 0, 10);
  },
  beginDay(s) {
    if (s.phase !== 'rite') return 'The day begins after the rite.';
    return beginDay(s);
  },
  build(s, { mirror }) {
    const M = MIRRORS[mirror];
    if (!M) return 'No such mirror.';
    if (s.res.glass + EPS < M.glass) return `A ${M.name} needs ${M.glass} glass.`;
    s.res.glass = Math.max(0, s.res.glass - M.glass);
    const m = addMirror(s, mirror, nextPlace(s));
    say(s, `The ${m.name} is finished: room for ${M.cap} more ${M.cap === 1 ? 'shade' : 'shades'}.`, 'good');
  },
  ward(s) {
    const r = s.raid;
    if (s.phase !== 'day' || !r || r.state !== 'coming' || !r.warned) return 'No raid to ward against.';
    if (r.ward) return 'The gate is already warded.';
    if (s.res.essence + EPS < s.tuning.wardCost) return `A ward costs ${s.tuning.wardCost} essence.`;
    s.res.essence = Math.max(0, s.res.essence - s.tuning.wardCost);
    r.ward = s.tuning.wardDefense;
    say(s, `The gate is warded with essence: defense +${r.ward}.`, 'good');
  },
  // Playtest note: how a death felt. Doesn't touch the simulation.
  feel(s, { id, feel }) {
    const e = ledgerOf(s, id);
    if (!e) return 'No such death.';
    if (feel !== null && !FEELS.includes(feel)) return 'Unknown feeling.';
    e.feel = feel;
  },
  tune(s, { key, value }) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return 'Needs a number.';
    const [a, b] = key.split('.');
    if (b ? typeof s.tuning[a]?.[b] !== 'number' : typeof s.tuning[a] !== 'number') return 'No such setting.';
    if ((key === 'daySecs' || key === 'nightSecs') && v < 5) return 'At least 5 seconds.';
    if (b) s.tuning[a][b] = v;
    else s.tuning[a] = v;
  },
  debug(s, a) {
    if (a.what === 'raid') {
      if (s.phase !== 'day') return 'Raids come by day.';
      if (s.raid && s.raid.state === 'coming') return 'A raid is already coming.';
      const D = dayTicks(s);
      if (s.t >= D - 2) return 'Too late in the day.';
      s.raid = newRaid(s, s.t + 1, Math.min(D - 1, s.t + Math.round(0.15 * D)));
      return;
    }
    if (a.what === 'give') {
      if (!(a.res in s.res)) return 'No such resource.';
      gain(s, a.res, Number(a.n) || 0);
      return;
    }
    const p = byId(s.living, a.id);
    if (!p) return 'No one living by that name.';
    if (a.what === 'sick') {
      if (p.sick > 0) return `${p.name} is already sick.`;
      p.sick = Math.round(s.tuning.sickDays * dayTicks(s));
      say(s, `${p.name} has fallen sick.`, 'bad', true);
      return;
    }
    if (a.what === 'kill') {
      if (!CAUSES[a.cause] || a.cause === 'raider') return 'No such cause.';
      kill(s, p, a.cause, a.cause === 'yours' ? 'was put to death on your order' : undefined);
      return;
    }
    return 'Unknown debug action.';
  },
};

export function act(s, a) {
  if (s.phase === 'fallen' && a.type !== 'feel') return { ok: false, error: 'The keep has fallen.' };
  const f = ACTIONS[a.type];
  if (!f) return { ok: false, error: `Unknown action: ${a.type}` };
  const at = { day: s.day, phase: s.phase, t: s.t };
  const error = f(s, a);
  if (error) return { ok: false, error };
  s.actions.push({ a, at });
  s.rev++;
  return { ok: true };
}

// Rebuild a session from its seed, starting tuning and action log (for bug reports and tests).
export function replay(seed, tuning, actions) {
  const s = newGame(seed, tuning);
  for (const { a, at } of actions) {
    let guard = 1e7;
    while (!(s.day === at.day && s.phase === at.phase && s.t === at.t)) {
      if (s.phase !== 'day' && s.phase !== 'night') throw new Error(`Replay stuck: day ${s.day} ${s.phase}, waiting for day ${at.day} ${at.phase} t${at.t}`);
      if (!guard--) throw new Error('Replay ran away');
      step(s);
    }
    const r = act(s, a);
    if (!r.ok) throw new Error(`Replay action ${a.type} failed: ${r.error}`);
  }
  return s;
}
