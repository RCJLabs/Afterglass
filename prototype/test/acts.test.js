import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, replay, upgrade, addFoe, canWork, canAct, actCost, acting, preyNear, wayOf } from '../src/slice/sim.js';
import { autoStep } from '../src/slice/autopilot.js';
import { geo, lightMap, roomSpan, roomAt, GNAW_GAP } from '../src/slice/geo.js';
import { howTo } from '../src/slice/howto.js';
import { TUNING } from '../src/slice/data.js';

// The original four-floor keep with nothing by day to get in the way, no traits to bend the numbers, and no
// inspector.
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
// One shade, made the kind a test wants (a state edit, so these keeps don't replay), unnamed, with memory
// to spend.
function shadeOf(s, kind) {
  const d = s.shades.find(canWork);
  Object.assign(d, { kind, named: false, memory: 80 });
  return d;
}
const steps = (s, n) => {
  for (let i = 0; i < n; i++) step(s);
};

test('Stand: the light a Loyal shade stands in is not gnawed while it stands, and it strikes twice as hard', () => {
  const run = (stand) => {
    const s = newSeason(3, quiet);
    emptyNight(s);
    const d = shadeOf(s, 'loyal');
    ok(s, { type: 'candle', f: d.f, x: d.x });
    const k = s.night.candles.at(-1);
    const span = lightMap(geo(s), s.tuning, s.night.candles).spans[d.f].find(([, , id]) => id === k.id);
    const { x0 } = roomSpan(geo(s), roomAt(geo(s), d.f, d.x));
    const c = addFoe(s, 'creeper', d.f, Math.max(x0 + 1, span[0] - GNAW_GAP), { temper: 'snuff' });
    Object.assign(c, { hp: 999, max: 999 });
    if (stand) ok(s, { type: 'shadeAct', id: d.id });
    const wax = k.wax;
    steps(s, 40);
    // Once both are at the light's edge, the shade striking the Creeper: how hard, over three seconds.
    const hp = c.hp;
    steps(s, 30);
    return { gnawed: wax - k.wax - 70 * 0.1, hit: hp - c.hp, d, s };
  };
  const plain = run(false);
  const stood = run(true);
  assert.ok(plain.gnawed > 1, `without Stand the candle is gnawed (${plain.gnawed})`);
  assert.ok(Math.abs(stood.gnawed) < 1e-6, `standing, it burns only its own time (${stood.gnawed})`);
  assert.ok(plain.hit > 0 && Math.abs(stood.hit / plain.hit - TUNING.standFight) < 0.35, `twice as hard: ${stood.hit} against ${plain.hit}`);
  assert.equal(stood.d.memory, 80 - TUNING.actCost.stand);
  assert.ok(stood.s.log.some((l) => /stands its ground/.test(l.text)));
  // After its seconds, the Stand is over.
  steps(stood.s, TUNING.actSecs.stand * 10);
  assert.ok(!acting(stood.s, stood.d, 'stand'));
});

test('Kindle: a Serene shade renews its candle, or lights one in the dark, free', () => {
  const s = newSeason(3, quiet);
  emptyNight(s);
  const d = shadeOf(s, 'serene');
  ok(s, { type: 'candle', f: d.f, x: d.x });
  const k = s.night.candles.at(-1);
  k.wax = 10;
  const store = s.res.candles;
  ok(s, { type: 'shadeAct', id: d.id });
  assert.equal(k.wax, Math.min(k.max, 10 + TUNING.candleWax * TUNING.kindleWax));
  assert.equal(s.res.candles, store, 'no candle from the store');
  assert.match(act(s, { type: 'shadeAct', id: d.id }).error, /acted once tonight/);
  // The next night, standing in the dark, it lights its own.
  while (s.phase === 'night') step(s);
  ok(s, { type: 'beginDay' });
  emptyNight(s);
  d.memory = 80;
  const n = s.night.candles.length;
  const before = s.res.candles;
  ok(s, { type: 'shadeAct', id: d.id });
  assert.equal(s.night.candles.length, n + 1);
  assert.deepEqual([s.night.candles.at(-1).f, s.night.candles.at(-1).x, s.night.candles.at(-1).wax], [d.f, Math.round(d.x * 2) / 2, TUNING.candleWax * TUNING.kindleWax]);
  assert.equal(s.res.candles, before);
});

test('Pass unseen: a Pale shade slips a grip, and the Unlit pass it by', () => {
  const s = newSeason(3, quiet);
  emptyNight(s);
  const d = shadeOf(s, 'pale');
  const c = addFoe(s, 'creeper', d.f, d.x);
  Object.assign(c, { hp: 999, max: 999, mode: 'hunt', prey: d.id, grab: d.id });
  d.grabbedBy = c.id;
  steps(s, 5);
  assert.equal(d.grabbedBy, c.id, 'caught in the dark');
  ok(s, { type: 'shadeAct', id: d.id });
  assert.equal(d.grabbedBy, null);
  assert.ok(s.log.some((l) => /passes unseen, out of the Creeper's grip/.test(l.text)));
  const L = lightMap(geo(s), s.tuning, s.night.candles);
  assert.equal(preyNear(s, L, c, c.x, c.x)?.id === d.id, false, 'not prey while it passes');
  steps(s, 20);
  assert.equal(d.grabbedBy, null, 'not caught again while it passes');
});

test('Lure: the Unlit on a Stranger\'s floor within reach come for it, even from another light', () => {
  const s = newSeason(3, quiet);
  emptyNight(s);
  const d = shadeOf(s, 'stranger');
  ok(s, { type: 'candle', f: d.f, x: d.x });
  const L = lightMap(geo(s), s.tuning, s.night.candles);
  // One in the dark just past the light's edge, within reach; one beyond reach.
  const edge = L.merged[d.f].find(([a, b]) => d.x >= a && d.x <= b)[1];
  const room = (x) => [0, 1, 2, 3, 4, 5, 6].map((i) => x + i).find((y) => roomAt(geo(s), d.f, y));
  const near = addFoe(s, 'creeper', d.f, room(edge + 4), { temper: 'snuff' });
  const far = addFoe(s, 'creeper', d.f, room(d.x + TUNING.lureReach + 4), { temper: 'snuff' });
  assert.ok(near.x - d.x <= TUNING.lureReach && far.x - d.x > TUNING.lureReach);
  assert.notEqual(wayOf(s, L, near).prey, d.id, 'before the Lure it goes about its own business');
  ok(s, { type: 'shadeAct', id: d.id });
  assert.deepEqual([wayOf(s, L, near).mode, wayOf(s, L, near).prey], ['hunt', d.id]);
  assert.notEqual(wayOf(s, L, far).prey, d.id, 'out of reach, it is not called');
  steps(s, TUNING.actSecs.lure * 10 + 1);
  assert.notEqual(wayOf(s, L, near).prey, d.id, 'the Lure is over');
});

test('one act a night, paid in memory (half for the named); none by day, or without the memory; old saves have none', () => {
  const s = newSeason(3, quiet);
  const d = shadeOf(s, 'loyal');
  assert.match(act(s, { type: 'shadeAct', id: d.id }).error, /at night/);
  emptyNight(s);
  d.named = true;
  assert.equal(actCost(s, d), TUNING.actCost.stand / 2);
  d.memory = TUNING.actCost.stand / 2;
  assert.ok(!canAct(s, d));
  assert.match(act(s, { type: 'shadeAct', id: d.id }).error, /would cost/);
  d.memory = 50;
  ok(s, { type: 'shadeAct', id: d.id });
  assert.equal(d.memory, 50 - TUNING.actCost.stand / 2);
  assert.ok(!canAct(s, d));
  const old = JSON.parse(JSON.stringify(newSeason(4, { ...quiet, acts: 0 })));
  for (const t of [old.tuning, old.tuning0]) delete t.acts;
  const g = upgrade(old);
  assert.equal(g.tuning.acts, 0);
  emptyNight(g);
  assert.match(act(g, { type: 'shadeAct', id: g.shades.find(canWork).id }).error, /no acts/);
  const all = (T) => howTo(T).flatMap((x) => x.items).join(' ');
  assert.match(all(TUNING), /one act a night/);
  assert.ok(!/one act a night/.test(all({ ...TUNING, acts: 0 })));
});

test('a keep whose shades act replays exactly', () => {
  const s = newSeason(1);
  while (!(s.days.at(-1)?.night?.acts?.length) && s.phase !== 'over' && s.phase !== 'end') autoStep(s, 'balanced');
  assert.ok(s.days.at(-1)?.night?.acts?.length, 'the autopilot acted by the season\'s end');
  const r = replay(s.seed, s.tuning0, s.actions);
  while ((r.phase === 'day' || r.phase === 'night') && !(r.season === s.season && r.day === s.day && r.phase === s.phase && r.t === s.t)) step(r);
  assert.deepEqual([r.day, r.log.length, r.shades.map((d) => [d.id, d.memory])], [s.day, s.log.length, s.shades.map((d) => [d.id, d.memory])]);
});
