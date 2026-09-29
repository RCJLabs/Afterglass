// Round seven, phase 7's four levers, each against its switch: a tide goes for the thinner stair, a Maw left
// unmet ruins the room it broke, a lantern costs half a candle (errands.test.js), and the Hollow hunts lanterns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSeason, step, act, addFoe, canWork } from '../src/slice/sim.js';
import { geo, lineSpots, roomAt, DEEP_FLOOR } from '../src/slice/geo.js';
import { MAP } from '../src/slice/data.js';

const ok = (s, a) => {
  const r = act(s, a);
  assert.ok(r.ok, `${a.type}: ${r.error}`);
};
const quiet = { startFloors: 4, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, visitors: 0, cracksMax: 99 };
function toPlace(s) {
  while (s.phase === 'day') step(s);
  if (s.dusk.step === 'crypt') ok(s, { type: 'wake' });
}
const mid = MAP.W / 2;

test('a tide rises at the rift on the side whose stair has less fight; switched off, at its own', () => {
  const rose = (thinStair, extra = {}) => {
    const s = newSeason(3, { ...quiet, thinStair, ...extra });
    toPlace(s);
    const [left, right] = [lineSpots(geo(s)).find((p) => p.x < mid), lineSpots(geo(s)).find((p) => p.x > mid)];
    ok(s, { type: 'candle', f: left.f, x: left.x });
    ok(s, { type: 'candle', f: right.f, x: right.x });
    const ds = s.shades.filter(canWork);
    ok(s, { type: 'move', id: ds[0].id, f: left.f, x: left.x + 1 }); // the left stair held, the right thin
    for (const d of ds.slice(1)) ok(s, { type: 'move', id: d.id, f: geo(s).veil, x: 40 });
    ok(s, { type: 'startNight' });
    s.night.spawns = [{ at: s.t, type: 'creeper', seep: false, snuff: false, rift: 'r1' }]; // its own rift: the left
    step(s);
    const c = s.night.foes.find((u) => u.type === 'creeper');
    return { f: c.f, x: c.x, said: s.log.slice(-3).map((l) => l.text).find((t) => /^A tide rises/.test(t)) };
  };
  const on = rose(1);
  assert.equal(on.f, DEEP_FLOOR);
  assert.ok(on.x > mid, `on the right, the thin side (x ${on.x})`);
  assert.equal(on.said, 'A tide rises at the right rift, for the thinner stair on the right.');
  const off = rose(0);
  assert.ok(off.x < mid, `off, at its own rift on the left (x ${off.x})`);
  assert.equal(off.said, undefined, 'and nothing said');
  const tut = rose(1, { tutorial: 1 });
  assert.ok(tut.x < mid && tut.said === undefined, "not in the tutorial's scripted nights, which teach the plain line");
});

// A Maw set down in a twin room on the Veil's floor, making for it, with the shades wherever `post` puts them.
function mawNight(tuning, post) {
  const s = newSeason(3, { ...quiet, ...tuning });
  toPlace(s);
  const G = geo(s);
  const f = G.veil - 1;
  const x = 60;
  const id = roomAt(G, f, x);
  for (const d of s.shades.filter(canWork)) ok(s, { type: 'move', id: d.id, f: G.veil, x: 20 });
  if (post) ok(s, { type: 'move', id: s.shades.find(canWork).id, f, x: x + 2 });
  ok(s, { type: 'startNight' });
  s.night.spawns = [];
  const m = addFoe(s, 'maw', f, x);
  Object.assign(m, { target: { kind: 'room', id, f, x }, path: [], replan: 1e9, hp: 1e9, max: 1e9 });
  return { s, m, id };
}
const ticks = (secs) => Math.round(secs * 10);

test('a Maw left unmet in a room it broke ruins it: tomorrow half the work there, and more Dread at the rite', () => {
  const { s, m, id } = mawNight({ mawRuin: 12 });
  const T = s.tuning;
  for (let i = 0; i < ticks(T.mawBreak) + 1; i++) step(s);
  assert.ok(s.night.broken.includes(id), 'broken');
  assert.equal(m.ruining, id, 'and it stays to ruin it');
  for (let i = 0; i < ticks(T.mawRuin) - 2; i++) step(s);
  assert.ok(!s.night.ruined?.includes(id), 'not yet');
  for (let i = 0; i < 3; i++) step(s);
  assert.deepEqual(s.night.ruined, [id]);
  assert.match(s.log.at(-1).text, /^Left alone, the Maw has ruined the .*: tomorrow the .*'s workers manage 50%, and it costs 1 more Dread at dawn\.$/);
  assert.equal(m.ruining, null, 'then it moves on');
  s.night.foes = s.night.foes.filter((u) => u !== m); // and is cut down, before it ruins another
  while (s.phase === 'night') step(s);
  assert.deepEqual(s.ruined, [id]);
  assert.equal(s.rite.ruined, 1);
});

test('a shade standing with the Maw stops the ruin; switched off, the Maw moves on at once', () => {
  const met = mawNight({ mawRuin: 12 }, true);
  for (let i = 0; i < ticks(met.s.tuning.mawBreak + met.s.tuning.mawRuin) + 20; i++) step(met.s);
  assert.ok(met.s.night.broken.includes(met.id));
  assert.ok(!met.s.night.ruined?.includes(met.id), 'met, it never ruins it');
  const off = mawNight({ mawRuin: 0 });
  for (let i = 0; i < ticks(off.s.tuning.mawBreak) + 1; i++) step(off.s);
  assert.ok(off.s.night.broken.includes(off.id));
  assert.equal(off.m.ruining, undefined, 'off, it never stays');
  assert.notEqual(off.m.target?.id, off.id, 'and goes for something else');
});

test('the Hollow turns toward a lantern it can reach; switched off, it keeps to the mirrors', () => {
  const lured = (hollowLure) => {
    const s = newSeason(3, { ...quiet, hollowLure, lanterns: 1 });
    toPlace(s);
    const d = s.shades.find(canWork);
    ok(s, { type: 'move', id: d.id, f: DEEP_FLOOR, x: 96 });
    ok(s, { type: 'lantern', id: d.id });
    ok(s, { type: 'startNight' });
    s.night.spawns = [];
    const h = addFoe(s, 'hollow', DEEP_FLOOR, 14);
    step(s);
    return { lured: !!h.lured, goal: h.path.at(-1), said: s.log.some((l) => l.text === 'The Hollow turns from the mirrors toward the lantern.') };
  };
  const on = lured(1);
  assert.ok(on.lured && on.said);
  assert.equal(on.goal.f, DEEP_FLOOR, 'its way ends at the lantern');
  const off = lured(0);
  assert.ok(!off.lured && !off.said);
});

test('a candle in the room holds the ruin while the Maw tears it down; switched off, it doesn\'t', () => {
  const held = (ruinLight) => {
    const { s, m, id } = mawNight({ mawRuin: 12, ruinLight });
    const T = s.tuning;
    for (let i = 0; i < ticks(T.mawBreak) + 1; i++) step(s);
    assert.equal(m.ruining, id);
    ok(s, { type: 'candle', f: m.f, x: m.x + 2 });
    for (let i = 0; i < ticks(T.mawRuin) + 2; i++) step(s);
    return { s, id, T };
  };
  const on = held(1);
  assert.ok(!on.s.night.ruined?.includes(on.id), 'held for as long as the candle stood');
  assert.ok(on.s.log.some((l) => /the room holds while it burns/.test(l.text)));
  // A candle stands candleWax ÷ mawSmash seconds against it; then the ruin goes on.
  for (let i = 0; i < ticks(on.T.candleWax / on.T.mawSmash); i++) step(on.s);
  assert.deepEqual(on.s.night.ruined, [on.id], 'and ruined once it was torn down');
  const off = held(0);
  assert.deepEqual(off.s.night.ruined, [off.id], 'off, a candle holds nothing');
});
