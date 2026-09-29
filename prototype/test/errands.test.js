import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, addFoe, canWork, nightTicks } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { geo, lightMap, isLit } from '../src/slice/geo.js';
import { howTo } from '../src/slice/howto.js';
import { TUNING } from '../src/slice/data.js';

// The original four-floor keep, nothing by day to get in the way, no traits, and no inspector.
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, dreamwell: 0, weather: 0, firstInspection: 99, traits: 0 };
const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
// Night 1 begun with nothing to come: the tests bring their own Unlit.
function emptyNight(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
}
const steps = (s, n) => {
  for (let i = 0; i < n; i++) step(s);
};

test('a lantern takes its price in candles and carries its light with the shade; set down, it stays', () => {
  const s = newSeason(3, quiet);
  emptyNight(s);
  const d = s.shades.find(canWork);
  const store = s.res.candles;
  ok(s, { type: 'lantern', id: d.id });
  assert.equal(s.res.candles, store - TUNING.lanternCost);
  const k = s.night.candles.find((c) => c.carrier === d.id);
  assert.ok(k && k.wax === TUNING.lanternWax);
  // Walk it across its floor: the light goes with it.
  const x = d.x < 50 ? d.x + 30 : d.x - 30;
  ok(s, { type: 'move', id: d.id, f: d.f, x });
  steps(s, 60);
  assert.ok(Math.abs(d.x - x) < 1, 'it got there');
  assert.equal(k.x, d.x);
  assert.ok(isLit(lightMap(geo(s), s.tuning, s.night.candles), d.f, d.x));
  // In its own light it can't be caught.
  const c = addFoe(s, 'creeper', d.f, d.x + 1);
  Object.assign(c, { hp: 999, max: 999, mode: 'hunt', prey: d.id });
  steps(s, 10);
  assert.equal(d.grabbedBy, null);
  // Set down, it stays where it was.
  ok(s, { type: 'lantern', id: d.id });
  assert.equal(k.carrier, undefined);
  const at = k.x;
  ok(s, { type: 'move', id: d.id, f: d.f, x: x < 50 ? x + 20 : x - 20 });
  steps(s, 30);
  assert.equal(k.x, at);
});

test('a Maw can tear down a lantern carried through the doorway between two rooms', () => {
  const s = newSeason(3, quiet);
  emptyNight(s);
  const d = s.shades.find(canWork);
  const [a, b] = geo(s).floors[d.f].rooms;
  ok(s, { type: 'lantern', id: d.id });
  const k = s.night.candles.find((c) => c.carrier === d.id);
  d.x = (a[2] + b[1]) / 2; // in the wall between them, as it is halfway through
  const m = addFoe(s, 'maw', d.f, d.x + 1);
  Object.assign(m, { target: { kind: 'candle', id: k.id, f: d.f, x: d.x }, path: [], replan: 99 });
  steps(s, 2);
  assert.ok(s.log.some((l) => /A Maw is tearing down the lantern in the /.test(l.text)));
});

test('echoes and relics below the line: the first shade to reach one takes it', () => {
  const s = newSeason(3, { ...quiet, errandFrom: 1 });
  emptyNight(s);
  const G = geo(s);
  const es = s.night.errands.filter((e) => e.kind !== 'sleeper');
  assert.ok(es.length >= 1 && es.length <= 2);
  assert.ok(es.every((e) => e.f < G.veil - 1), 'below the line');
  const d = s.shades.find(canWork);
  for (const e of es) {
    d.memory = 50;
    const glass = s.res.glass;
    Object.assign(d, { f: e.f, x: e.x, ox: e.x, of: e.f, path: [] });
    step(s);
    assert.deepEqual([e.done, e.by], ['taken', d.name]);
    if (e.kind === 'echo') assert.equal(d.memory, 50 + TUNING.echoMemory);
    else assert.ok(s.res.glass >= glass + TUNING.relicGlass);
  }
  assert.ok(s.log.some((l) => /finds an echo|brings back a relic/.test(l.text)));
});

// A sleepwalker every night from night 1, and nothing else.
const sleepy = { ...quiet, errandFrom: 99, sleepFrom: 1, sleepChance: 1 };
function toSleeper(seed) {
  const s = newSeason(seed, sleepy);
  emptyNight(s);
  const e = s.night.errands.find((x) => x.kind === 'sleeper');
  assert.ok(e, 'a sleepwalker tonight');
  while (!e.out) step(s);
  return { s, e };
}

test('a sleepwalker comes out at their hour; a shade that reaches them walks them back to bed', () => {
  const { s, e } = toSleeper(3);
  assert.ok(s.log.some((l) => l.text.startsWith(`${e.name} is sleepwalking in the Tain`)));
  const d = s.shades.find(canWork);
  Object.assign(d, { f: e.f, x: e.x, ox: e.x, of: e.f, path: [] });
  step(s);
  assert.deepEqual([e.done, e.by], ['saved', d.name]);
  assert.ok(s.living.some((p) => p.id === e.who));
});

// Out, and on the floor below the Veil's: they come out by the mirror in the Quarters' twin, and a Creeper
// put there would go through the Veil. Nobody to save them.
function belowVeil(seed) {
  const a = toSleeper(seed);
  for (const d of a.s.shades) d.mirror = null;
  while (a.e.f >= geo(a.s).veil || a.e.climb) step(a.s);
  steps(a.s, 5);
  const L = lightMap(geo(a.s), a.s.tuning, a.s.night.candles);
  assert.ok(!isLit(L, a.e.f, a.e.x), 'the sleepwalker is in the dark');
  return a;
}

test('the Unlit that catch a sleepwalker in the dark hold them; light wakes them', () => {
  const a = belowVeil(3);
  addFoe(a.s, 'creeper', a.e.f, a.e.x + 1);
  steps(a.s, 3);
  assert.ok(a.e.held, 'held');
  assert.ok(a.s.log.some((l) => l.text.startsWith(`A Creeper has caught ${a.e.name}, sleepwalking in the dark`)));
  const x = a.e.x;
  steps(a.s, 20);
  assert.equal(a.e.x, x, 'held, they stay where they are');
  assert.equal(a.e.done, null, 'not yet');
  ok(a.s, { type: 'candle', f: a.e.f, x: a.e.x });
  step(a.s);
  assert.deepEqual([a.e.done, a.e.by], ['saved', null], 'the light wakes them');
  assert.ok(a.s.log.some((l) => l.text.startsWith(`${a.e.name} wakes in the light`)));
  assert.ok(a.s.living.some((p) => p.id === a.e.who));
  // One whose sleepers' twin is lit wakes as they come out.
  const s = newSeason(3, sleepy);
  emptyNight(s);
  const e = s.night.errands.find((x) => x.kind === 'sleeper');
  ok(s, { type: 'candle', f: e.f, x: e.x });
  while (!e.out) step(s);
  step(s);
  assert.equal(e.done, 'saved');
});

test('held too long, or at the Deep, a sleepwalker dies in their sleep and wakes Pale', () => {
  // Caught.
  const a = belowVeil(3);
  addFoe(a.s, 'creeper', a.e.f, a.e.x + 1);
  steps(a.s, 3);
  assert.ok(a.e.held);
  steps(a.s, TUNING.sleepHold * 10 - 5);
  assert.equal(a.e.done, null, 'still held');
  steps(a.s, 5);
  assert.equal(a.e.done, 'lost');
  const b = a.s.bodies.find((x) => x.id === a.e.who);
  assert.deepEqual([b.cause, b.kind], ['sleep', 'pale']);
  assert.match(b.how, /caught by the Unlit, sleepwalking/);
  // The Deep: a sleepwalker out early enough in the night to walk that far before dawn.
  let c = null;
  for (let seed = 1; seed < 40 && !c; seed++) {
    const x = toSleeper(seed);
    if (x.s.t < nightTicks(x.s) * 0.5) c = x;
  }
  assert.ok(c, 'a sleepwalker out before midnight');
  for (const d of c.s.shades) d.mirror = null;
  for (let i = 0; i < 4000 && !c.e.done; i++) step(c.s);
  assert.equal(c.e.done, 'lost');
  assert.match(c.s.bodies.find((x) => x.id === c.e.who).how, /walked into the Deep in their sleep/);
});

test('errands and lanterns replay exactly; old saves have neither; How to play covers them', () => {
  // The first seed from 1 where the autopilot fetches something in its first season.
  const fetched = (x) => x.days.some((d) => d.night?.errands?.some((e) => e.done === 'taken'));
  let s = null;
  for (let seed = 1; seed < 30 && !(s && fetched(s)); seed++) {
    s = newSeason(seed);
    while (!fetched(s) && s.phase !== 'over' && s.phase !== 'end') autoStep(s, 'balanced');
  }
  assert.ok(fetched(s), 'the autopilot fetched something');
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.day, r.log.length, r.res.glass, r.shades.map((d) => [d.id, d.memory])], [s.day, s.log.length, s.res.glass, s.shades.map((d) => [d.id, d.memory])]);
  const old = JSON.parse(JSON.stringify(newSeason(4, { ...quiet, lanterns: 0, errands: 0 })));
  for (const t of [old.tuning, old.tuning0]) {
    delete t.lanterns;
    delete t.errands;
  }
  const g = upgrade(old);
  assert.deepEqual([g.tuning.lanterns, g.tuning.errands], [0, 0]);
  emptyNight(g);
  assert.equal(g.night.errands, undefined);
  assert.match(act(g, { type: 'lantern', id: g.shades.find(canWork).id }).error, /no lanterns/);
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /carry a lantern/);
  assert.match(all(TUNING), /sleepwalks into the Tain/);
  assert.ok(!/carry a lantern|sleepwalks/.test(all({ ...TUNING, lanterns: 0, errands: 0 })));
});
