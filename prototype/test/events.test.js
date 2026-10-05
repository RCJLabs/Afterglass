// Round seven, phase 14: events toward sixty. Cruelty: four happenings inside the keep, each with an answer that
// kills one of your own on your order, who wakes at dusk a Wraith. Four more omens. And a visitor for each year
// from the third to the tenth, who comes once, in its year. Each behind a rule that keeps from before have off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, dayTicks, upgrade, RULES_SINCE, rollCruelty, rollYearVisitor, judgedDread, byId, omenText } from '../src/slice/sim.js';
import { runSeasonAuto } from '../src/slice/autopilot.js';
import { TUNING, VISITORS, OMENS } from '../src/slice/data.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const no = (s, a, re) => {
  const r = act(s, a);
  assert.ok(!r.ok, `${a.type} should be refused`);
  if (re) assert.match(r.error, re);
};
// Nothing else by day to get in the way: no fire, sickness, old age, weather, raids, inspector or visitor.
const calm = { fire: 0, sickChance: 0, oldAgeChance: 0, weather: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, firstInspection: 99, visitorChance: 0 };
// A card brought now (a happening inside the keep or a visitor at the gate), and waited for.
function card(s, kind, extra = {}) {
  const v = { id: `v${s.season}.${s.day}.${s.visitors.length}`, kind, at: s.t + 1, until: s.t + 1 + Math.round(s.tuning.visitorWait * dayTicks(s)), here: false, done: null, ...extra };
  s.visitors.push(v);
  while (!v.here && !v.gone && s.phase === 'day') step(s);
  assert.ok(v.here, `the ${kind} came`);
  return v;
}
const answer = (s, v, id) => ok(s, { type: 'visitor', id: v.id, answer: id });
const grown = (s) => s.living.find((p) => p.age !== 'child' && p.job !== 'barracks');
// Through dusk and the crossing to the night's start, with no Unlit.
function toNight(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
}
function nextDay(s) {
  toNight(s);
  s.night.spawns = [];
  while (s.phase === 'night') step(s);
  if (s.phase === 'end') ok(s, { type: 'nextSeason' });
  ok(s, { type: 'beginDay' });
}

test('keeps from before have none of it: the three rules are off, and no new kind is ever drawn or met', () => {
  for (const key of ['cruelty', 'moreOmens', 'yearVisitors']) {
    const r = RULES_SINCE.find((x) => x.key === key);
    assert.ok(r && r.old === 0, `${key} is in RULES_SINCE, off for old keeps`);
    assert.equal(TUNING[key], 1, `${key} is on for new keeps`);
  }
  const saved = newSeason(4);
  for (const key of ['cruelty', 'moreOmens', 'yearVisitors']) delete saved.tuning[key];
  const old = upgrade(saved);
  assert.deepEqual([old.tuning.cruelty, old.tuning.moreOmens, old.tuning.yearVisitors], [0, 0, 0]);
  const fresh = Object.keys(VISITORS).filter((k) => VISITORS[k].by);
  assert.equal(fresh.length, 12);
  const s = runSeasonAuto(5, { plan: 'balanced', seasons: 2, tuning: { cruelty: 0, moreOmens: 0, yearVisitors: 0 } });
  const met = Object.keys(s.met || {});
  assert.ok(!met.some((k) => fresh.includes(k.replace('visitor:', '')) || ['omen:star', 'omen:cold', 'omen:lull', 'omen:kin'].includes(k)), met.join(', '));
  // Nor, with the rules on, is one drawn with the visitors at the gate.
  for (let seed = 1; seed <= 60; seed++) for (const v of newSeason(seed, { visitFrom: 1, visitorChance: 1 }).visitors) assert.ok(!VISITORS[v.kind].by, v.kind);
});

test("a traitor's lantern: hanged, they wake at dusk a Wraith and the raid comes x0.8; let be, x1.25; locked up, they work no more today", () => {
  const go = (id) => {
    const s = newSeason(6, { ...calm, raidDays: { 1: 8, 2: 0, 4: 0, 6: 0 }, traitorChance: 1 });
    const v = s.visitors.find((x) => x.kind === 'traitor');
    assert.ok(v, 'on a day the Host comes, at its chance');
    assert.ok(v.until < s.raid.hitAt, 'it waits only until the Host is at the gate');
    while (!v.here) step(s);
    const p = byId(s.living, v.named);
    const was = s.raid.strength;
    answer(s, v, id);
    return { s, p, was };
  };
  let { s, p, was } = go('hang');
  assert.ok(!byId(s.living, p.id));
  const b = s.bodies.find((x) => x.id === p.id);
  assert.equal(b.cause, 'yours');
  assert.equal(b.kind, 'wraith');
  assert.ok(Math.abs(s.raid.strength - Math.round(was * 0.8 * 10) / 10) < 1e-9);
  toNight(s);
  assert.ok(s.shades.some((d) => d.id === p.id && d.kind === 'wraith'), 'at dusk they wake a Wraith');
  ({ s, p, was } = go('no'));
  assert.ok(byId(s.living, p.id));
  assert.ok(Math.abs(s.raid.strength - Math.round(was * 1.25 * 10) / 10) < 1e-9);
  ({ s, p, was } = go('lock'));
  assert.ok(byId(s.living, p.id) && p.job === null, 'kept, and idle');
  no(s, { type: 'assign', id: p.id, room: 'hearth' }, /locked up until dusk/);
  assert.equal(s.raid.strength, was);
});

test('the plague-bearer: walled in, they wake a Wraith, and no one else falls sick that season', () => {
  const s = newSeason(7, { ...calm, sickChance: 1 });
  s.season = 2; // summer's plague
  const p = grown(s);
  const v = card(s, 'bearer', { named: p.id });
  answer(s, v, 'wall');
  assert.equal(s.bodies.find((x) => x.id === p.id).kind, 'wraith');
  assert.equal(s.walled, s.season);
  const sick = () => s.living.filter((x) => x.sick > 0).length;
  for (let i = 0; i < 3; i++) {
    nextDay(s);
    while (s.phase === 'day') step(s);
    assert.equal(sick(), 0, `day ${s.day}: nobody sick, though sickness came every day before`);
  }
});

test("the Hollow's price: paid, the new moon has no Hollow; refused, it rises; from the keep's second year", () => {
  const moon = (id) => {
    const s = newSeason(8, { ...calm, priceChance: 1 });
    s.season = 5; // the second year's spring
    s.day = s.tuning.seasonDays - 1;
    nextDay(s);
    const v = s.visitors.find((x) => x.kind === 'price');
    assert.ok(v, 'on the new moon, at its chance');
    while (!v.here) step(s);
    answer(s, v, id);
    toNight(s);
    return s;
  };
  assert.ok(!moon('give').night.spawns.some((sp) => sp.type === 'hollow'));
  assert.ok(moon('no').night.spawns.some((sp) => sp.type === 'hollow'));
  const first = newSeason(8, { ...calm, priceChance: 1 });
  first.day = first.tuning.seasonDays;
  first.visitors = [];
  rollCruelty(first);
  assert.ok(!first.visitors.length, 'not in the first year');
});

test('the witch-hunter: before an inspection, at Dread 3; given up, Dread -2 and a Wraith; refused, Dread +1', () => {
  for (const [id, dread] of [['burn', 1], ['no', 4]]) {
    const s = newSeason(9, { ...calm, hunterChance: 1 });
    s.dread = 3;
    s.inspection = { day: s.day + 1, reason: 'dread', done: false };
    s.visitors = [];
    rollCruelty(s);
    const v = s.visitors.find((x) => x.kind === 'hunter');
    assert.ok(v);
    while (!v.here) step(s);
    answer(s, v, id);
    assert.equal(s.dread, dread);
    if (id === 'burn') assert.equal(s.bodies.find((x) => x.id === v.named).cause, 'yours');
  }
});

test('a cruel answer to someone already dead is refused', () => {
  const s = newSeason(10, calm);
  s.season = 2;
  const p = grown(s);
  const v = card(s, 'bearer', { named: p.id });
  ok(s, { type: 'debug', what: 'kill', id: p.id, cause: 'sickness' });
  no(s, { type: 'visitor', id: v.id, answer: 'wall' }, /dead already/);
});

test('four more omens, each with its own effect, and each says what it does', () => {
  for (const id of ['star', 'cold', 'lull', 'kin']) {
    assert.ok(OMENS[id]?.more);
    assert.ok(omenText(TUNING, { id, rift: 'left', at: { f: 0, x: 40 } }).length > 20);
  }
  // A falling star lies in the deepest dark below the line, and the first shade there brings back its glass.
  const s = newSeason(11, { ...calm, startFloors: 4, omenOnly: 'star', omenChance: 1, omenFrom: 1, omenChoice: 0 });
  toNight(s);
  assert.equal(s.night.omen?.id, 'star');
  const e = s.night.errands.find((x) => x.kind === 'star');
  assert.ok(e && e.f === 0);
  const d = s.shades.find((x) => x.mirror);
  Object.assign(d, { f: e.f, x: e.x, path: [] });
  const glass = s.res.glass;
  s.night.spawns = [];
  for (let i = 0; i < 20 && !e.done; i++) step(s);
  assert.equal(e.done, 'taken');
  assert.equal(s.res.glass, glass + s.tuning.starGlass);
  // A lull in the Deep: a quarter of the night's Creepers stay down.
  const count = (omen) => {
    const b = newSeason(12, { ...calm, omenOnly: omen || 'star', omenChance: omen ? 1 : 0, omenFrom: 1, omenChoice: 0 });
    toNight(b);
    return b.night.spawns.filter((sp) => sp.type === 'creeper').length;
  };
  const all = count(null);
  assert.equal(count('lull'), all - Math.floor(all / 4));
});

test('grave-cold slows the Unlit and burns the candles faster; the dead remember fight harder and fade faster', () => {
  const run = (omen) => {
    const s = newSeason(13, { ...calm, startFloors: 4, omens: 1, omenOnly: omen, omenChance: omen ? 1 : 0, omenFrom: 1, omenChoice: 0 });
    toNight(s);
    return s;
  };
  // Candles: the same candle a second, with the omen and without.
  const wax = (omen) => {
    const s = run(omen);
    s.night.spawns = [];
    s.res.candles = Math.max(s.res.candles, 1);
    const d = s.shades.find((x) => x.mirror);
    ok(s, { type: 'candle', f: d.f, x: d.x });
    const k = s.night.candles.at(-1);
    const w = k.wax;
    for (let i = 0; i < 10; i++) step(s);
    return w - k.wax;
  };
  const plain = wax(null);
  assert.ok(plain > 0 && Math.abs(wax('cold') - plain * 1.25) < 1e-6, `a quarter faster (${plain})`);
  // Fading: a shade's memory at dawn, with the omen and without.
  const fade = (omen) => {
    const s = run(omen);
    s.night.spawns = [];
    const d = s.shades.find((x) => x.mirror);
    const m = d.memory;
    while (s.phase === 'night') step(s);
    return { lost: m - byId(s.shades, d.id).memory };
  };
  const a = fade(null).lost;
  const k = fade('kin').lost;
  assert.ok(a > 0 && Math.abs(k - a * 1.5) < 1e-6, `fades half again as fast (${a} and ${k})`);
});

test("the years' visitors: each comes in its year, once, from summer's third day; none in the campaign", () => {
  const years = Object.entries(VISITORS).filter(([, V]) => V.year).map(([k, V]) => [V.year, k]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(years.map(([y]) => y), [3, 4, 5, 6, 7, 8, 9, 10]);
  const at = (season, day, tuning = {}) => {
    const s = newSeason(14, { ...calm, ...tuning });
    s.season = season;
    s.day = day;
    s.visitors = [];
    rollYearVisitor(s);
    return s;
  };
  assert.equal(at(9, 3).visitors.length, 0, 'not in the third year\'s spring');
  assert.equal(at(10, 2).visitors.length, 0, "nor before summer's third day");
  assert.equal(at(10, 3).visitors[0]?.kind, 'levy');
  assert.equal(at(14, 5).visitors[0]?.kind, 'chronicler');
  assert.equal(at(40, 1).visitors[0]?.kind, 'founding', "the tenth year's, as late as its winter");
  assert.equal(at(44, 3).visitors.length, 0, 'none after the tenth');
  const once = at(10, 3);
  once.yearVisit = 3;
  once.visitors = [];
  rollYearVisitor(once);
  assert.equal(once.visitors.length, 0, 'once a year');
  assert.equal(at(10, 3, { campaign: 1 }).visitors.length, 0, 'not in the campaign');
});

test("the years' visitors' answers do what their cards say", () => {
  // The levy: the two who came last go, and the lord's riders stand at the next raid.
  let s = newSeason(15, calm);
  const two = s.living.filter((p) => p.age !== 'child').slice(-2).map((p) => p.id);
  let v = card(s, 'levy');
  answer(s, v, 'send');
  assert.ok(two.every((id) => !byId(s.living, id)));
  assert.equal(s.riders, 4);
  // The envoy: no raid for the rest of the season.
  s = newSeason(16, { ...calm, raidDays: { 2: 6, 4: 7, 6: 9 } });
  s.res.food = 40;
  s.res.glass = 20;
  v = card(s, 'envoy');
  answer(s, v, 'pay');
  for (let i = 0; i < 5; i++) {
    nextDay(s);
    assert.ok(!s.raid, `day ${s.day}: no raid`);
  }
  // The bishop: Dread -1, and judged a Dread kinder for the rest of the year.
  s = newSeason(17, { ...calm, churchLedger: 0 });
  s.res.remembrance = 10;
  s.dread = 3;
  v = card(s, 'bishop');
  answer(s, v, 'bless');
  assert.equal(s.dread, 2);
  assert.equal(judgedDread(s), 1);
  // The wanderer: a Loyal shade joins, its memory whole.
  s = newSeason(18, calm);
  const n = s.shades.length;
  v = card(s, 'wanderer');
  answer(s, v, 'take');
  assert.equal(s.shades.length, n + 1);
  const d = s.shades.at(-1);
  assert.ok(d.kind === 'loyal' && d.memory === 100 && d.mirror);
  // The founding feast: every shade gains 25 memory.
  s = newSeason(19, calm);
  s.res.food = 30;
  for (const x of s.shades) x.memory = 50;
  v = card(s, 'founding');
  answer(s, v, 'feast');
  assert.ok(s.shades.every((x) => x.memory === 75));
  // Pilgrims: every shade loses 10 memory, for their alms.
  s = newSeason(20, calm);
  const food = s.res.food;
  const mem = s.shades.map((x) => x.memory);
  v = card(s, 'shrine');
  answer(s, v, 'pray');
  assert.equal(s.res.food, food + 6);
  assert.deepEqual(s.shades.map((x) => x.memory), mem.map((m) => Math.max(0, m - 10)));
  // The claimant, thrown out: his men fire a room.
  s = newSeason(21, { ...calm, fire: 1 });
  v = card(s, 'claimant');
  answer(s, v, 'no');
  assert.equal(s.fires.length, 1);
});
